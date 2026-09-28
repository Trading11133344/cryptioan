import{defineConfig}from'vite';
import react from'@vitejs/plugin-react';
import tailwindcss from'@tailwindcss/vite';
import{attachLedger}from'./server/ledger.mjs';
import path from'node:path';

import{fileURLToPath}from'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins:[
    react(),
    tailwindcss(),
    {name:'ledger',configureServer(s){attachLedger(s.middlewares)}},
    {name:'admin-route',configureServer(s){
      s.middlewares.use((req,res,next)=>{
        if(req.url&&req.url.split('?')[0]==='/super-secret-CryptOrion-System'){
          req.url='/super-secret-CryptOrion-System.html'+(req.url.split('?')[1]?'?'+req.url.split('?')[1]:'');
        }
        next();
      });
    }}
  ],
  server:{host:'0.0.0.0',port:5173,strictPort:true,allowedHosts:true,
    watch:{ignored:['**/data/**','**/tw-ledger.json','**/node_modules/**','**/dist/**','**/backups/**']},
    proxy:{'/api/binance':{target:'https://data-api.binance.vision',changeOrigin:true,rewrite:p=>p.replace(/^\/api\/binance/,'')}}
  },
  build:{rollupOptions:{input:{main:'index.html',admin:'super-secret-CryptOrion-System.html'}}}
});
