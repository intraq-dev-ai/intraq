export function customerFacingMessage(message: string): string {
  return message
    .split(/(```[\s\S]*?```)/g)
    .map(part => part.startsWith('```') ? part : customerFacingText(part))
    .join('');
}

function customerFacingText(text: string): string {
  return text
    .replace(/\bmetadata\s+([a-z][\w -]{1,80}?)\s+model\b/gi, '$1 data source')
    .replace(/\bmetadata\s+data[-\s]?model\b/gi, 'data source')
    .replace(/\bmetadata\s+data source\b/gi, 'data source')
    .replace(/\bmetadata\s+SQL\b/gi, 'SQL')
    .replace(/\bmetadata\s+tables\b/gi, 'tables')
    .replace(/\bmetadata\s+fields\b/gi, 'fields')
    .replace(/\bmodel\s+metadata\b/gi, 'data source details')
    .replace(/\bmetadata\s+metadata\b/gi, 'data source details')
    .replace(/\bmodel\s+metadata\b/gi, 'data source details')
    .replace(/\bmetadata\b/gi, 'details')
    .replace(/\bmetadata with\b/gi, 'set up with')
    .replace(/\bmetadata\b/gi, 'configured');
}
