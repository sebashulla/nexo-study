import { deflateRawSync } from 'node:zlib'
function crc32(bytes: Buffer) { let crc=0xffffffff; for (const byte of bytes) { crc^=byte; for(let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0) }; return (crc^0xffffffff)>>>0 }
export function officeZip(parts: Record<string,string>) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset=0
  for (const [name,text] of Object.entries(parts)) {
    const filename=Buffer.from(name), bytes=Buffer.from(text), compressed=deflateRawSync(bytes), crc=crc32(bytes)
    const header=Buffer.alloc(30); header.writeUInt32LE(0x04034b50,0); header.writeUInt16LE(20,4); header.writeUInt16LE(8,8); header.writeUInt32LE(crc,14)
    header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(filename.length,26)
    local.push(header,filename,compressed)
    const index=Buffer.alloc(46); index.writeUInt32LE(0x02014b50,0); index.writeUInt16LE(20,4); index.writeUInt16LE(20,6); index.writeUInt16LE(8,10)
    index.writeUInt32LE(crc,16); index.writeUInt32LE(compressed.length,20); index.writeUInt32LE(bytes.length,24); index.writeUInt16LE(filename.length,28); index.writeUInt32LE(offset,42)
    central.push(index,filename); offset+=header.length+filename.length+compressed.length
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(Object.keys(parts).length,8); end.writeUInt16LE(Object.keys(parts).length,10)
  end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16)
  return Buffer.concat([...local,directory,end])
}
export const docxParts = {
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Campo eléctrico</w:t></w:r></w:p><w:p><w:r><w:t>La fuerza de Coulomb relaciona la carga eléctrica y el cuadrado de la distancia.</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>El campo se mide en newtons por coulomb.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Fuerza</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Newton</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Potencial</w:t></w:r></w:p><w:p><w:r><w:t>La energía potencial eléctrica depende de las cargas presentes y su separación.</w:t></w:r></w:p></w:body></w:document>',
}
export const pptxParts = {
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
  'ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
  'ppt/_rels/presentation.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
  'ppt/slides/slide2.xml':'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Movimiento parabólico</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>La velocidad horizontal permanece constante cuando no hay fuerza horizontal.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  'ppt/slides/slide1.xml':'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>La velocidad vertical se anula en el vértice.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  'ppt/slides/_rels/slide2.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>',
  'ppt/notesSlides/notesSlide4.xml':'<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Explicar la independencia de las componentes.</a:t></a:r></a:p></p:txBody></p:sp></p:notes>',
}
export const docx = officeZip(docxParts), pptx = officeZip(pptxParts)
