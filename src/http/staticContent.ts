export const LLMS_TXT = `# Jsonaut

> Agent-native JSON toolkit. Turn messy or untrusted text into clean, schema-valid
> JSON: repair malformed JSON, extract JSON embedded in prose, validate against a
> schema, and infer a schema from examples. Deterministic operations are free;
> LLM-backed repair/extraction for the hard cases is pay-per-call and charged only
> on success. No accounts, no signup.

## Endpoints

- POST /v1/repair — repair + validate malformed JSON.
  Body: {"input": "<string>", "schema": {...optional JSON Schema...}, "allow_llm_fallback": true}
  Response: {"valid": bool, "repaired": <json>, "method": "direct"|"deterministic-repair"|"llm-repair"|"failed", "changes": [".."], "errors": [".."]}
- POST /v1/extract — pull JSON out of arbitrary text (LLM prose, chat, logs, emails).
  Body: {"input": "<text>", "schema": {...optional...}, "allow_llm_fallback": true}
- POST /v1/validate — validate only. Body: {"input": "<string>", "schema": {...}}
- POST /v1/infer-schema — infer a JSON Schema from an example. Free, deterministic.
  Body: {"input": "<json string>", "as_samples": false}
- POST /mcp — MCP server (Streamable HTTP, stateless). Tools: repair_json, extract_json, validate_json, infer_schema.
- GET /openapi.yaml — machine-readable API spec.
- GET /.well-known/ai-plugin.json — plugin manifest.

## Pricing

- Deterministic repair, extraction, validation, and schema inference: free, rate-limited per IP per day.
- LLM-backed repair or extraction (only runs when the deterministic tier can't produce valid output): $0.01 per successful call. Failed calls are never charged.

## Payment

x402 (the only paid rail): an unpaid LLM call returns HTTP 402 with an "accepts"
payment requirement (USDC on Base). Pay and retry with the X-PAYMENT header. No
accounts, no signup, no human in the loop.

## Notes for agents

- Set allow_llm_fallback=false to guarantee a free call (you'll get llm_required=true if the deterministic tier can't solve it).
- Use /v1/extract when JSON is buried in a model's natural-language reply or a tool's noisy output.
- Use /v1/infer-schema to turn a sample response into a reusable schema, then pass that schema to /v1/repair or /v1/extract to enforce structure.
- "changes" lists every modification made to your input, so you can audit the result.
- The MCP endpoint is stateless: no session or handshake persistence required.
`;

export const AI_PLUGIN = {
  schema_version: "v1",
  name_for_human: "Jsonaut",
  name_for_model: "jsonaut",
  description_for_human: "Repair, extract, validate, and infer schemas for JSON from LLM and agent output.",
  description_for_model:
    "Use Jsonaut to (1) repair malformed JSON, (2) extract JSON embedded in arbitrary text, (3) validate JSON against a JSON Schema, and (4) infer a JSON Schema from example values. Deterministic operations are free; LLM-backed repair and extraction are pay-per-call via the x402 protocol (USDC on Base) and charged only on success. REST endpoints live under /v1; an MCP server is at /mcp with tools repair_json, extract_json, validate_json, infer_schema.",
  api: { type: "openapi", url: "/openapi.yaml" },
  logo_url: "/",
  contact_email: "support@jsonaut.dev",
  legal_info_url: "/",
} as const;

export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Jsonaut
  version: 0.2.0
  description: >
    Agent-native JSON toolkit: repair malformed JSON, extract JSON from text,
    validate against a schema, and infer a schema from examples. Deterministic
    operations are free; LLM-backed repair/extraction is pay-per-call (x402) and
    charged only on success.
servers:
  - url: /
paths:
  /v1/repair:
    post:
      operationId: repairJson
      summary: Repair and validate possibly-malformed JSON
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [input]
              properties:
                input:
                  type: string
                  description: The possibly-broken JSON text
                schema:
                  type: object
                  description: Optional JSON Schema the output must conform to
                allow_llm_fallback:
                  type: boolean
                  default: true
                  description: Permit the paid LLM repair tier if deterministic repair fails
      responses:
        "200":
          description: Repair attempt completed (check the valid field)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RepairResult"
        "402":
          description: LLM fallback required but no valid payment supplied (x402 accepts body)
        "400":
          description: Malformed request
        "413":
          description: Input, schema, or body exceeds size limits
        "429":
          description: Free-tier daily rate limit exceeded
  /v1/extract:
    post:
      operationId: extractJson
      summary: Extract JSON embedded in arbitrary text
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [input]
              properties:
                input:
                  type: string
                  description: Text that may contain JSON (LLM prose, logs, emails)
                schema:
                  type: object
                  description: Optional JSON Schema the output must conform to
                allow_llm_fallback:
                  type: boolean
                  default: true
                  description: Permit the paid LLM extraction tier if no JSON is found deterministically
      responses:
        "200":
          description: Extraction attempt completed (check the valid field)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RepairResult"
        "402":
          description: LLM extraction required but no valid payment supplied
        "429":
          description: Free-tier daily rate limit exceeded
  /v1/validate:
    post:
      operationId: validateJson
      summary: Validate JSON against a schema (no repair)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [input, schema]
              properties:
                input:
                  type: string
                schema:
                  type: object
      responses:
        "200":
          description: Validation result
  /v1/infer-schema:
    post:
      operationId: inferSchema
      summary: Infer a JSON Schema from an example value (free, deterministic)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [input]
              properties:
                input:
                  type: string
                  description: A JSON value (or array of samples) to infer a schema from
                as_samples:
                  type: boolean
                  default: false
                  description: Treat a top-level array as multiple samples of one shape
      responses:
        "200":
          description: "{ ok: true, schema: {...} } or a parse error"
  /mcp:
    post:
      operationId: mcp
      summary: MCP server endpoint (Streamable HTTP transport, stateless)
      description: "Tools: repair_json, extract_json, validate_json, infer_schema. JSON-RPC 2.0 over POST."
      responses:
        "200":
          description: JSON-RPC response
components:
  schemas:
    RepairResult:
      type: object
      properties:
        valid:
          type: boolean
        repaired:
          description: The repaired/extracted JSON value (null when method=failed)
        method:
          type: string
          enum: [direct, deterministic-repair, llm-repair, llm-extract, failed]
        changes:
          type: array
          items:
            type: string
        errors:
          type: array
          items:
            type: string
        llm_required:
          type: boolean
          description: Present when the deterministic tier failed and the paid LLM tier could be attempted
`;
