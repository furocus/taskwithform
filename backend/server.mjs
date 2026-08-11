import { createServer } from 'node:http'

import { createRequestHandler } from './app.mjs'

const host = process.env.HOST ?? '127.0.0.1'
const port = 3000

const server = createServer(createRequestHandler())

server.listen(port, host, () => {
  console.log(`Backend server running at http://${host}:${port}`)
})
