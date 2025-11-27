/**
 * Lightweight debug helper with optional toggle via env DEBUG=true or a specific flag env.
 * Defaults to enabled unless explicitly gated (pass flag to require FLAG=true).
 */
export class Debugger {
  private static isEnabled(flag?: string): boolean {
    if (flag) return process.env[flag] === "true";
    // Default to enabled; set DEBUG=false to silence globally
    return process.env.DEBUG !== "false";
  }

  static log(message: string, flag?: string) {
    if (!this.isEnabled(flag)) return;
    console.log(message);
  }

  static logInfo(message: string, flag?: string) {
    this.log(`ℹ️  ${message}`, flag);
  }

  static logSuccess(message: string, flag?: string) {
    this.log(`✅ ${message}`, flag);
  }

  static logWarn(message: string, flag?: string) {
    if (!this.isEnabled(flag)) return;
    console.warn(`⚠️  ${message}`);
  }

  static logError(message: string, flag?: string) {
    if (!this.isEnabled(flag)) return;
    console.error(`❌ ${message}`);
  }

  static logJSON(label: string, value: unknown, flag?: string) {
    if (!this.isEnabled(flag)) return;
    try {
      console.log(label, JSON.stringify(value, null, 2));
    } catch {
      console.log(label, value);
    }
  }

  /**
   * Attempt to parse and pretty-print a payload (Buffer/string/object).
   */
  static logPayload(label: string, body: unknown, flag?: string) {
    if (!this.isEnabled(flag)) return;
    let rawString: string;
    try {
      rawString = Buffer.isBuffer(body)
        ? body.toString()
        : typeof body === "string"
        ? body
        : JSON.stringify(body);
    } catch {
      rawString = String(body);
    }

    try {
      const parsed = JSON.parse(rawString);

      // If deprecated Synctera fields exist, parse them for readability only
      if (parsed && typeof parsed === "object") {
        if (typeof (parsed as any).event_resource === "string") {
          try {
            (parsed as any).event_resource = JSON.parse((parsed as any).event_resource);
          } catch {
            /* noop */
          }
        }
        if (typeof (parsed as any).event_resource_changed_fields === "string") {
          try {
            (parsed as any).event_resource_changed_fields = JSON.parse(
              (parsed as any).event_resource_changed_fields
            );
          } catch {
            /* noop */
          }
        }
      }

      this.logJSON(label, parsed, flag);
    } catch {
      this.log(`${label} (unparsed): ${rawString}`, flag);
    }
  }

  static throwError(message: string): never {
    throw new Error(message);
  }
}
