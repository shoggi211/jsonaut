export const LLMS_TXT = `# Jsonaut

> Agent-native JSON repair & validation API. Send possibly-malformed JSON (from an
> LLM tool call, another agent, or a flaky upstream), get back parsed, schema-valid
> JSON. Deterministic repair is free; LLM-fallback repair for hard cases is
> pay-per-call and charged only on success.

## Endpoints

- POST /v1/repair — repair + validate. Body: {"input": "<string>", "schema": {...optional JSON Schema...}, "allow_llm_fallback": true}
  Response: {"valid": bool, "repaired": <json>, "method": "direct"|"deterministic-repair"|"llm-repair"|"failed", "changes": [".."], "errors": [".."]}
- POST /v1/validate — validate only. Body: {"input": "<string>", "schema": {...}}
- POST /mcp — MCP server (Streamable HTTP transport). Tools: repair_json, validate_json.
- GET /openapi.yaml — machine-readable API spec.

## Pricing

- Deterministic repair and validation: free, rate-limited per IP per day.
- LLM-fallback repair (only runs when deterministic repair fails): $0.01 per successful call.
  Failed repairs are never charged.

## Payment

x402 (the only paid rail): an unpaid LLM-fallback call returns HTTP 402 with an
"accepts" payment requirement (USDC on Base). Pay and retry with the X-PAYMENT
header. No accounts, no signup, no human in the loop.

## Notes for agents

- Always try with allow_llm_fallback=false first if you want to guarantee a free call.
- The "method" field tells you how the repair was achieved; "changes" lists every
  modification made to your input so you can audit it.
- The MCP endpoint is stateless: no session or handshake persistence required.
`;

export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Jsonaut
  version: 0.1.0
  description: >
    Agent-native JSON repair & validation. Deterministic repair is free;
    LLM-fallback repair is pay-per-call (x402 or prepaid API key) and charged
    only on success.
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
  /mcp:
    post:
      operationId: mcp
      summary: MCP server endpoint (Streamable HTTP transport, stateless)
      description: "Tools: repair_json, validate_json. JSON-RPC 2.0 over POST."
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
          description: The repaired, parsed JSON value (null when method=failed)
        method:
          type: string
          enum: [direct, deterministic-repair, llm-repair, failed]
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
          description: Present when deterministic repair failed and the paid LLM tier could be attempted
`;
