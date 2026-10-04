import fs from 'node:fs';
const js=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const must=[
  'cardstudio-asset-library-v1','normalizeAssetLibrary','assetLibraryApproxBytes','studioAssetCategoryToCommunity',
  'importAssetLibraryFile','exportAssetLibrary','addAssetsToLibrary','renderAssetLibrary','addFreeImageFromAsset'
];
for(const t of must)if(!js.includes(t))throw new Error('共享素材能力缺失: '+t);
for(const id of ['openAssetLibrary','assetLibraryModal','assetLibraryFile','assetLibraryUpload','assetList','assetDetail'])if(!html.includes(`id="${id}"`))throw new Error('素材库 DOM 缺失: '+id);
if(!js.includes('MAX_ASSET_LIBRARY_BYTES=120*1024*1024'))throw new Error('素材库缺少 120MB 总量边界');
if(!js.includes('MAX_LIBRARY_ASSETS=1000'))throw new Error('素材库缺少 1000 项数量边界');
if(!js.includes('roles.includes("frameImage")')||!js.includes('roles.includes("textureImage")')||!js.includes('roles.includes("art")'))throw new Error('Studio → Community 分类映射不完整');
if(!js.includes('safeImageDataUrl'))throw new Error('素材库没有复用安全栅格数据校验');
if(/svg/i.test(html.match(/id="assetLibraryUpload"[^>]+/i)?.[0]||''))throw new Error('素材上传入口不应接受 SVG');
console.log('Community 1.3.0 shared asset library contract passed.');
