// Only MCP resource HTML may start the host handshake. A normal website inside
// ChatGPT's link preview is an ordinary iframe, not an MCP App connection.
export function uiSurface(kind,isFramed){
 if(kind==='mcp')return 'mcp';
 return isFramed?'web-preview':'web';
}

// Native webviews may relay messages through the same window. A request echo
// must never be mistaken for the host's response with the same request id.
export function isRpcResponse(message){
 return !!message&&message.jsonrpc==='2.0'&&message.id!==undefined&&
  !message.method&&(Object.hasOwn(message,'result')||Object.hasOwn(message,'error'));
}
