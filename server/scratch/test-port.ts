import http from 'http';

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Hello');
});

server.on('error', (e) => {
    console.error('Error binding to port 3001:', e);
});

server.listen(3001, () => {
    console.log('Successfully bound to port 3001');
    process.exit(0);
});
