import envPaths from 'env-paths';
import fs from 'node:fs';
import path from 'node:path';

const paths = envPaths('twigvcs', {suffix:''});

fs.mkdirSync(paths.data, { recursive: true })
fs.writeFileSync(path.join(paths.data, 'TOKEN' ), '', 'utf8')
fs.writeFileSync(path.join(paths.data, 'SERVER' ), 'https://twig-cli.vercel.app', 'utf8')