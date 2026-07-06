/**
 * Deterministic JSON Schema (draft 2020-12) inference from an example value.
 * No LLM — walks the value and produces a schema, merging across array items and
 * multiple samples. Detects a few common string formats.
 */

type Schema = Record<string, unknown>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URI = /^https?:\/\/[^\s]+$/i;

function stringFormat(v: string): Schema {
  if (EMAIL.test(v)) return { format: "email" };
  if (DATE_TIME.test(v)) return { format: "date-time" };
  if (DATE.test(v)) return { format: "date" };
  if (UUID.test(v)) return { format: "uuid" };
  if (URI.test(v)) return { format: "uri" };
  return {};
}

/** Merge a list of schemas: identical → one; otherwise anyOf of the distinct schemas. */
function mergeSchemas(schemas: Schema[]): Schema {
  const seen = new Map<string, Schema>();
  for (const s of schemas) seen.set(JSON.stringify(s), s);
  const distinct = [...seen.values()];
  if (distinct.length === 1) return distinct[0];
  // Merge object schemas structurally so a list of similar objects yields one object schema.
  if (distinct.every((s) => s.type === "object")) return mergeObjectSchemas(distinct);
  return { anyOf: distinct };
}

function mergeObjectSchemas(objs: Schema[]): Schema {
  const propNames = new Set<string>();
  for (const o of objs) for (const k of Object.keys((o.properties as Schema) ?? {})) propNames.add(k);
  const properties: Schema = {};
  const required: string[] = [];
  for (const name of propNames) {
    const variants: Schema[] = [];
    let inAll = true;
    for (const o of objs) {
      const p = (o.properties as Schema | undefined)?.[name] as Schema | undefined;
      if (p) variants.push(p);
      else inAll = false;
    }
    properties[name] = mergeSchemas(variants);
    if (inAll) required.push(name);
  }
  const out: Schema = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) out.required = required.sort();
  return out;
}

function build(value: unknown): Schema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array", items: {} };
    return { type: "array", items: mergeSchemas(value.map(build)) };
  }
  switch (typeof value) {
    case "string":
      return { type: "string", ...stringFormat(value) };
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const properties: Schema = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        properties[k] = build(v);
        required.push(k);
      }
      const out: Schema = { type: "object", properties, additionalProperties: false };
      if (required.length > 0) out.required = required;
      return out;
    }
    default:
      return {};
  }
}

/**
 * Infer a JSON Schema from one parsed example (or an array treated as samples of
 * the same shape when `asSamples` is set). Adds the $schema dialect marker.
 */
export function inferSchema(value: unknown, asSamples = false): Schema {
  const core =
    asSamples && Array.isArray(value) && value.length > 0 ? mergeSchemas(value.map(build)) : build(value);
  return { $schema: "https://json-schema.org/draft/2020-12/schema", ...core };
}
