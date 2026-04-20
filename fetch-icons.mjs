import fs from 'fs';

async function download(url, dest) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

async function main() {
  await download('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=192&h=192&fit=crop', 'public/icon-192.jpg');
  await download('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=512&h=512&fit=crop', 'public/icon-512.jpg');
  console.log('Icons downloaded');
}

main();
