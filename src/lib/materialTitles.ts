export function displayMaterialTitle(title: string) {
  return title.replace(/[_#]+/g, ' ').replace(/\s*[-–—]\s*/g, ' — ').replace(/\s+/g, ' ').trim()
}
