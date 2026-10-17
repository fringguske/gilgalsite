/**
 * Byte-compatible re-implementation of `System.Text.Json.JsonSerializer.Serialize(value)` with the
 * default options, for payloads that feed SHA-256 hashes or are stored verbatim:
 *  - object keys are written exactly as given (pass the same casing the C# anonymous type used);
 *  - the default `JavaScriptEncoder` escapes every non-ASCII character, plus " & ' + < > ` \ and
 *    control characters (as \uXXXX with upper-case hex; \b \t \n \f \r \\ \" use short forms);
 *  - `decimal` values keep their scale: wrap them with `JsonRaw` / `formatDecimal`.
 */
export class JsonRaw {
  constructor(readonly text: string) {}
}

const ShortEscapes: Record<string, string> = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
  '\\': '\\\\',
  '"': '\\"',
}

function escapeString(value: string): string {
  let result = '"'
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    const code = value.charCodeAt(index)
    const short = ShortEscapes[char]
    if (short !== undefined) {
      result += short
    } else if (code < 0x20 || code > 0x7e || '&\'+<>`'.includes(char)) {
      result += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      result += char
    }
  }

  return `${result}"`
}

export function serializeJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (value instanceof JsonRaw) return value.text
  switch (typeof value) {
    case 'string':
      return escapeString(value)
    case 'number':
      return String(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'object':
      if (Array.isArray(value)) return `[${value.map(serializeJson).join(',')}]`
      return `{${Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => `${escapeString(key)}:${serializeJson(item)}`)
        .join(',')}}`
    default:
      throw new TypeError(`Unsupported JSON value of type ${typeof value}.`)
  }
}

/**
 * `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]`: removes the listed keys whose
 * value is null so they are omitted from the response JSON instead of serialized as null.
 */
export function omitNullKeys<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  for (const key of keys) {
    if (value[key] === null || value[key] === undefined) delete value[key]
  }

  return value
}
