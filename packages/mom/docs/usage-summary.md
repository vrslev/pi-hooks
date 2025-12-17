# Usage Summary

The usage summary appears after each response, showing token usage, context utilization, and cost.

## Configuration

```json
// Disable entirely
{ "usageSummary": false }

// Enable (default)
{ "usageSummary": true }

// Custom formatter for full control
{ "usageSummary": { "formatter": "./scripts/my-formatter.js" } }
```

## Default Output

When enabled without a formatter, the usage summary displays:

- **Tokens**: Input and output token counts
- **Context**: Percentage of context window used
- **Cache**: Cache read/write counts (if any)
- **Cost**: Total cost with breakdown in footer

## Custom Formatter

For full control over the output, create a formatter script. The script receives usage data on stdin and outputs JSON.

### Input (stdin)

```json
{
  "tokens": { "input": 1234, "output": 567 },
  "cache": { "read": 500, "write": 100 },
  "context": { "used": 50000, "max": 200000, "percent": "25.0%" },
  "cost": {
    "input": 0.01,
    "output": 0.02,
    "cacheRead": 0.001,
    "cacheWrite": 0.002,
    "total": 0.033
  }
}
```

### Output (Discord)

Discord formatters output structured embed data:

```json
{
  "title": "My Stats",
  "color": 2829617,
  "fields": [
    { "name": "I/O", "value": "1,234 in / 567 out", "inline": true },
    { "name": "Cost", "value": "$0.033", "inline": true }
  ],
  "footer": "Custom footer text"
}
```

### Output (Slack)

Slack formatters output plain text:

```json
{
  "text": "*Stats*\nI/O: 1,234 in / 567 out\nCost: $0.033"
}
```

### Example Formatter

```javascript
#!/usr/bin/env node
const data = JSON.parse(require("fs").readFileSync(0, "utf8"));

const formatCost = (n) => `$${n.toFixed(4)}`;

console.log(
  JSON.stringify({
    title: "Usage",
    color: 0x2b2d31,
    fields: [
      {
        name: "Tokens",
        value: `${data.tokens.input.toLocaleString()} in / ${data.tokens.output.toLocaleString()} out`,
        inline: true,
      },
      { name: "Cost", value: formatCost(data.cost.total), inline: true },
    ],
  })
);
```

Make the script executable: `chmod +x scripts/my-formatter.js`

If the formatter fails or returns invalid JSON, the default format is used as a fallback.
