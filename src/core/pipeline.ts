import { jsonrepair } from "jsonrepair";
import { Validator } from "@cfworker/json-schema";
import { coerceToSchema } from "./coerce.js";
import type { RepairResult } from "./types.js";

type Schema = Record<string, unknown>;

/** Strip markdown code fences an LLM may have wrapped around the JSON. */
export function stripCodeFences(input: string): { text: string; stripped: boolean } {
  const trimmed = input.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9]*\s*\n?([\s\S]*?)\n?```\s*$/);
  if (match) return { text: match[1].trim(), stripped: true };
  return { text: trimmed, stripped: false };
}

function validate(value: unknown, schema: Schema): { valid: boolean; errors: string[] } {
  const validator = new Validator(schema as any, "2020-12", false);
  const result = validator.validate(value);
  if (result.valid) return { valid: true, errors: [] };
  const errors = result.errors
    .filter((e) => e.error && !e.error.startsWith("Property") /* keep leaf errors readable */)
    .map((e) => `${e.instanceLocation}: ${e.error}`);
  return { valid: false, errors: errors.length > 0 ? errors : result.errors.map((e) => `${e.instanceLocation}: ${e.error}`) };
}

/**
 * The free, deterministic tier: direct parse -> jsonrepair -> schema
 * validation with type coercion. Never calls an LLM.
 */
export function repairPipeline(input: string, schema?: Schema): RepairResult {
  if (typeof input !== "string" || input.trim() === "") {
    return { valid: false, repaired: null, method: "failed", changes: [], errors: ["input is empty"], llm_required: false };
  }

  const changes: string[] = [];
  let parsed: unknown;
  let method: RepairResult["method"] = "failed";
  let parseError = "";

  // 1. Direct parse
  try {
    parsed = JSON.parse(input);
    method = "direct";
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  // 2. Strip code fences, retry parse
  if (method === "failed") {
    const { text, stripped } = stripCodeFences(input);
    if (stripped) {
      try {
        parsed = JSON.parse(text);
        method = "deterministic-repair";
        changes.push("stripped markdown code fences");
      } catch {
        /* fall through to jsonrepair */
      }
    }

    // 3. jsonrepair on the fence-stripped text
    if (method === "failed") {
      try {
        const repairedText = jsonrepair(text);
        parsed = JSON.parse(repairedText);
        // jsonrepair "fixes" plain prose by wrapping it in quotes — that is not
        // a repair, it's garbage-in-garbage-out. Reject it and defer to the LLM tier.
        if (typeof parsed === "string" && !/^["'`]/.test(text)) {
          throw new Error("input is prose, not malformed JSON");
        }
        method = "deterministic-repair";
        if (stripped) changes.push("stripped markdown code fences");
        changes.push("repaired JSON syntax (jsonrepair)");
      } catch {
        return {
          valid: false,
          repaired: null,
          method: "failed",
          changes,
          errors: [`unparseable input: ${parseError}`],
          llm_required: true,
        };
      }
    }
  }

  // 4. Schema validation + coercion. Coercion always runs (it also fills
  // schema defaults), not just on validation failure.
  if (schema) {
    let check;
    try {
      check = validate(parsed, schema);
    } catch (e) {
      return {
        valid: false,
        repaired: null,
        method: "failed",
        changes,
        errors: [`invalid schema: ${e instanceof Error ? e.message : String(e)}`],
        llm_required: false,
      };
    }
    const coerced = coerceToSchema(parsed, schema);
    const recheck = validate(coerced.value, schema);
    if (recheck.valid) {
      if (coerced.changes.length > 0) {
        changes.push(...coerced.changes);
        if (method === "direct") method = "deterministic-repair";
      }
      return { valid: true, repaired: coerced.value, method, changes };
    }
    // Guard: never let coercion break input that already validated.
    if (check.valid) {
      return { valid: true, repaired: parsed, method, changes };
    }
    return {
      valid: false,
      repaired: parsed,
      method: "failed",
      changes,
      errors: recheck.errors,
      llm_required: true,
    };
  }

  return { valid: true, repaired: parsed, method, changes };
}

/** Validate-only path (no repair). Used by /v1/validate and the validate_json MCP tool. */
export function validateOnly(input: string, schema: Schema): { valid: boolean; errors: string[]; parsed: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return { valid: false, errors: [`unparseable input: ${e instanceof Error ? e.message : String(e)}`], parsed: null };
  }
  const result = validate(parsed, schema);
  return { valid: result.valid, errors: result.errors, parsed };
}
