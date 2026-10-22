export function artworkFilename(nickname: string) {
  const name = nickname
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');
  return `wow-mean-karya-${name || 'peserta'}.webp`;
}
