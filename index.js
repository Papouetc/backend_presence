import http from 'http';

const PORT = 8080;

http.createServer((req, res) => {
    res.writeHead(200, {})
    console.log("Requete reçu..");
    res.write("hello")
    res.end()
}).listen(PORT, () => {
    console.log("Serveur en ecoute...");
})

