const http = require('http');
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HSF-Project dev server running\n');
});
server.listen(port, () => console.log(`Dev server running at http://localhost:${port}`));
