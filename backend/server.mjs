import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 3000

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not Found')
})

server.listen(port, host, () => {
  console.log(`Backend server running at http://${host}:${port}`)
})
