import * as path from "path";

/**
 * Truncate content to specified length
 */
export function truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
        return content;
    }
    return content.substring(0, maxLength) + '...';
}

/**
 * Normalize a path to a consistent format: c:/aaa/bbb style
 * - Converts backslashes to forward slashes
 * - Removes trailing slashes
 * - Lowercases drive letter on Windows
 * - Resolves . and .. segments
 *
 * Examples:
 * - "C:\aaa\bbb" -> "c:/aaa/bbb"
 * - "c:\aaa\bbb" -> "c:/aaa/bbb"
 * - "c:/aaa/bbb" -> "c:/aaa/bbb"
 * - "C:\aaa\bbb\" -> "c:/aaa/bbb"
 * - "C:/AAA/BBB/" -> "c:/aaa/bbb"
 */
export function normalizePath(inputPath: string): string {
    if (!inputPath) {
        return inputPath;
    }

    // Resolve to absolute path and normalize . and .. segments
    let normalized = path.resolve(inputPath);

    // Convert all backslashes to forward slashes
    normalized = normalized.replace(/\\/g, '/');

    // Remove trailing slashes (except for root like "c:/")
    while (normalized.length > 1 && normalized.endsWith('/')) {
        if (/^[a-zA-Z]:\/$/.test(normalized)) {
            break; // Keep "c:/"
        }
        normalized = normalized.slice(0, -1);
    }

    // Lowercase the entire path on Windows for case-insensitive comparison
    if (process.platform === 'win32') {
        normalized = normalized.toLowerCase();
    }

    return normalized;
}

/**
 * Ensure path is absolute and normalized.
 * Returns path in c:/aaa/bbb style.
 */
export function ensureAbsolutePath(inputPath: string): string {
    return normalizePath(inputPath);
}

export function trackCodebasePath(codebasePath: string): void {
    const absolutePath = ensureAbsolutePath(codebasePath);
    console.log(`[TRACKING] Tracked codebase path: ${absolutePath} (not marked as indexed)`);
} 