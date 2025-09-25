# API SCHEMA (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": ["object", "array"],
  "definitions": {
    "item": {
      "type": "object",
      "additionalProperties": false,
      "required": ["item_id", "code", "grams"],
      "properties": {
        "item_id": {
          "type": "string",
          "minLength": 22,
          "maxLength": 22,
          "pattern": "^[A-Za-z0-9_-]{22}$"
        },
        "code": { "type": "string" },
        "name": { "type": "string" },
        "grams": { "type": "number", "minimum": 1, "maximum": 2000 },
        "grams_input": { "type": "number" },
        "portion_factor": { "type": "number", "minimum": 0.1, "maximum": 3 },
        "pending": { "type": "boolean" },
        "source": {
          "type": "string",
          "enum": ["text", "image", "ai_infer", "fallback"]
        },
        "note": { "type": "string", "maxLength": 200 }
      }
    },
    "section": {
      "type": "object",
      "additionalProperties": false,
      "required": ["slot", "event", "items"],
      "properties": {
        "slot": {
          "type": "string",
          "enum": ["breakfast", "lunch", "dinner", "snack", "other"]
        },
        "event": {
          "type": "string",
          "enum": ["eat", "skip"],
          "default": "eat"
        },
        "items": {
          "type": "array",
          "maxItems": 15,
          "items": { "$ref": "#/definitions/item" }
        },
        "is_set": { "type": "boolean", "default": false },
        "meta": { "type": "object" }
      }
    },
    "doc": {
      "type": "object",
      "additionalProperties": false,
      "required": ["date", "sections"],
      "properties": {
        "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
        "sections": {
          "type": "array",
          "maxItems": 8,
          "items": { "$ref": "#/definitions/section" }
        }
      }
    }
  },
  "oneOf": [
    { "$ref": "#/definitions/doc" },
    {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": { "$ref": "#/definitions/doc" }
    }
  ]
}
```
