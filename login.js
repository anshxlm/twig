import http from 'http';
import { exec } from 'child_process';
import fs from 'fs';

async function testPush(){

// This is the refresh_token your browser saved here earlier
const token = fs.readFileSync('.token.txt', 'utf8'); 

const formData = new FormData();
formData.append('file', new Blob([fs.readFileSync('image.JPG')]), 'image.JPG');

const res = await fetch('http://localhost:3000/api/push', {
  method: 'POST',
  headers: { 
    // We send the refresh token to the backend
    'Authorization': `Bearer ${token}` 
  },
  body: formData
});
const result = await res.json();
console.log(result);
// Save the rotated token so the next run works!
if (result.newRefreshToken) {
  fs.writeFileSync('.token.txt', result.newRefreshToken);
}
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token) {
    res.end('Success');
    fs.writeFileSync('.token.txt', token);
    console.log('Logged in successfully!');
    server.close();
    testPush()
  }
});

server.listen(4321, () => {
  exec(`start http://localhost:3000/auth/login?callback=http://localhost:4321`);
});

