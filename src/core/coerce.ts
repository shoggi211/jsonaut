/**
 * Best-effort coercion of a parsed value toward a JSON Schema.
 * Handles the mismatches LLMs actually produce: numbers/booleans as strings,
 * missing fields that have schema defaults, and extra fields on
 * additionalProperties:false objects. Does not resolve $ref.
 */

type Schema = Record<string, any>;

export interface CoercionOutcome {
  value: unknown;
  changes: string[];
}

function schemaTypes(schema: Schema): string[] {
  if (typeof schema.type === "string") return [schema.type];
  if (Array.isArray(schema.type)) return schema.type;
  return [];
}

export function coerceToSchema(value: unknown, schema: Schema, path = "$"): CoercionOutcome {
  const changes: string[] = [];
  const out = walk(value, schema, path, changes);
  return { value: out, changes };
}

function walk(value: unknown, schema: Schema, path: string, changes: string[]): unknown {
  if (!schema || typeof schema !== "object") return value;
  const types = schemaTypes(schema);

  // Primitive coercions
  if (typeof value === "string") {
    if (types.includes("number") || types.includes("integer")) {
      const n = Number(value.trim());
      if (value.trim() !== "" && Number.isFinite(n) && (!types.includes("integer") || types.includes("number") || Number.isInteger(n))) {
        changes.push(`${path}: coerced string "${value}" to number`);
        return n;
      }
    }
    if (types.includes("boolean")) {
      const v = value.trim().toLowerCase();
      if (v === "true" || v === "false") {
        changes.push(`${path}: coerced string "${value}" to boolean`);
        return v === "true";
      }
    }
    if (types.includes("null") && value.trim().toLowerCase() === "null") {
      changes.push(`${path}: coerced string "null" to null`);
      return null;
    }
  }
  if (typeof value === "number" && types.includes("string") && !types.includes("number") && !types.includes("integer")) {
    changes.push(`${path}: coerced number ${value} to string`);
    return String(value);
  }
  if (typeof value === "boolean" && types.includes("string") && !types.includes("boolean")) {
    changes.push(`${path}: coerced boolean ${value} to string`);
    return String(value);
  }

  // Objects
  if (value !== null && typeof value === "object" && !Array.isArray(value) && (types.length === 0 || types.includes("object"))) {
    const obj = { ...(value as Record<string, unknown>) };
    const props: Record<string, Schema> = schema.properties ?? {};

    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) {
        obj[key] = walk(obj[key], propSchema, `${path}.${key}`, changes);
      } else if (propSchema && typeof propSchema === "object" && "default" in propSchema) {
        obj[key] = propSchema.default;
        changes.push(`${path}.${key}: filled missing field with schema default`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          delete obj[key];
          changes.push(`${path}.${key}: removed field not allowed by schema`);
        }
      }
    }
    return obj;
  }

  // Arrays
  if (Array.isArray(value) && (types.length === 0 || types.includes("array"))) {
    const itemSchema = schema.items;
    if (itemSchema && typeof itemSchema === "object" && !Array.isArray(itemSchema)) {
      return value.map((item, i) => walk(item, itemSchema, `${path}[${i}]`, changes));
    }
    return value;
  }

  return value;
}
