#!/bin/bash
# Собирает папку site/ для версии «на экран Домой» из тех же файлов, что и Android-приложение
set -e
rm -rf site && cp -r app/src/main/assets/www site
node -e '
const fs=require("fs");
const exts=new Set(["mp3","m4a","ogg","wav","aac","opus"]);
let names=[];
try { names=fs.readdirSync("site/audio").filter(f=>exts.has(f.split(".").pop().toLowerCase())).sort(); } catch(e) {}
fs.writeFileSync("site/audio-list.js","window.AUDIO_FILES = "+JSON.stringify(names)+";\n");
console.log("audio files:", names.length);
'
sed -i "s/var VERSION = \"dev\";/var VERSION = \"${GITHUB_SHA:-local}\";/" site/sw.js
touch site/.nojekyll
