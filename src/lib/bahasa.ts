import type { Stage } from './workshop';

// Presentation copy only: stage IDs, durations, API responses and saved prompts stay unchanged.
export const STAGE_COPY: Record<Stage, { title: string; hint: string }> = {
  lobby: { title: 'Selamat datang', hint: 'Sertai bengkel dan bersedia untuk berkarya bersama.' },
  prompt: {
    title: 'Cari idea anda',
    hint: 'Pilih kapsyen, tambah sentuhan anda dan salin prompt.',
  },
  generate: {
    title: 'Masa untuk cipta',
    hint: 'Gunakan akaun AI sendiri, kemudian kembali dengan karya anda.',
  },
  submit: { title: 'Hantar karya', hint: 'Muat naik hasil anda untuk semakan fasilitator.' },
  gallery: {
    title: 'Galeri Karya',
    hint: 'Lihat hasil kreativiti semua. Undian akan dibuka sebentar lagi.',
  },
  vote: { title: 'Pilih kegemaran', hint: 'Satu peserta, satu undian. Raikan karya peserta lain.' },
  results: {
    title: 'Raikan pemenang',
    hint: 'Idea hebat, hasil kreatif. Semuanya bermula dengan anda!',
  },
};
export const COLLECTION_COPY: Record<string, { name: string; description: string }> = {
  classroom: { name: 'Cerita bilik darjah', description: 'Untuk detik istimewa bersama murid.' },
  encouragement: { name: 'Kata semangat', description: 'Sedikit dorongan, besar maknanya.' },
  staffroom: { name: 'Cerita bilik guru', description: 'Rakan guru pasti faham.' },
};
export const STYLE_COPY: Record<string, string> = {
  clay: 'Tanah liat 3D',
  comic: 'Komik pop',
  kawaii: 'Kawaii',
  doodle: 'Lakaran santai',
};

const messages: Record<string, string> = {
  'Please upload a classroom-friendly finished sticker.':
    'Sila hantar karya siap yang sesuai untuk bengkel guru.',
  'Please sign in again.': 'Sila log masuk semula.',
  'Your sign-in expired. Please sign in again.': 'Log masuk telah tamat. Sila masuk semula.',
  'Your previous workshop has ended. Please sign in again.':
    'Bengkel sebelum ini telah tamat. Sila masuk semula.',
  'Your previous workshop has ended. Please rejoin.':
    'Bengkel sebelum ini telah tamat. Sila sertai sesi baharu.',
  'That code is not active. Check it with your facilitator.':
    'Kod sesi tidak aktif. Semak kod dengan fasilitator anda.',
  'This workshop is full.': 'Sesi penuh. Had maksimum ialah 60 peserta.',
  'This workshop is closed.': 'Sesi ini telah ditutup.',
  'This workshop has ended.': 'Sesi bengkel ini telah tamat.',
  'This workshop has ended or does not exist.': 'Sesi telah tamat atau tidak ditemui.',
  'Join this workshop first.': 'Sila sertai sesi ini dahulu.',
  'Facilitator access is required.': 'Akses fasilitator diperlukan.',
  'Only the facilitator can do that.': 'Hanya fasilitator boleh melakukan tindakan ini.',
  'Only this workshop’s facilitator can end it.':
    'Hanya fasilitator pemilik sesi boleh memadam datanya.',
  'Use a separate participant browser to join anonymously.':
    'Gunakan browser berasingan untuk masuk sebagai peserta.',
  'Use a different browser profile to join as a participant.':
    'Gunakan profil browser lain untuk masuk sebagai peserta.',
  'Please try creating the workshop again.': 'Sesi belum berjaya dicipta. Sila cuba semula.',
  'Stages cannot reopen after voting starts.':
    'Peringkat tidak boleh dibuka semula selepas undian bermula.',
  'The workshop is complete.': 'Bengkel telah selesai.',
  'Approve at least one sticker before opening voting.':
    'Luluskan sekurang-kurangnya satu karya sebelum membuka undian.',
  'This stage cannot be paused.': 'Peringkat ini tidak boleh dijeda.',
  'The workshop is already running.': 'Bengkel sedang berjalan.',
  'Moderation closes when voting opens.': 'Semakan karya ditutup apabila undian dibuka.',
  'Sticker not found.': 'Karya tidak ditemui.',
  'Join as a participant first.': 'Sila masuk sebagai peserta dahulu.',
  'Facilitators cannot vote.': 'Fasilitator tidak boleh mengundi.',
  'Voting is closed.': 'Undian telah ditutup.',
  'Choose another creator’s sticker.':
    'Pilih karya peserta lain. Anda tidak boleh mengundi karya sendiri.',
  'Your vote has already been counted.':
    'Undian anda telah dikira. Satu peserta hanya boleh mengundi sekali.',
  'This sticker is not available for voting.': 'Karya ini tidak tersedia untuk undian.',
  'Invalid request format.': 'Format permintaan tidak sah. Sila cuba semula.',
  'Check the details and try again.': 'Semak maklumat yang dimasukkan dan cuba semula.',
  'Request origin is not allowed.': 'Permintaan tidak dibenarkan. Buka laman bengkel yang sah.',
  'The workshop is busy. Please retry.': 'Sesi sedang sibuk. Sila cuba sebentar lagi.',
  'The workshop service is unavailable. Please try again.':
    'Sambungan bengkel terganggu. Sila cuba semula.',
  'A little too fast! Wait a minute and try again.':
    'Terlalu banyak percubaan. Tunggu seminit dan cuba semula.',
  'Invalid workshop.': 'Sesi bengkel tidak sah.',
  'Invalid image.': 'Gambar tidak sah.',
  'Image unavailable.': 'Karya tidak lagi tersedia.',
  'Request body is required.': 'Maklumat permintaan tidak lengkap. Sila cuba semula.',
  'Request is too large.': 'Fail atau maklumat yang dihantar terlalu besar.',
  'Choose a sticker image.': 'Pilih gambar karya anda.',
  'Choose an image under 5 MB.': 'Pilih gambar di bawah 5 MB.',
  'Keep captions under 120 characters.': 'Hadkan kapsyen kepada 120 aksara.',
  'Choose a PNG, JPEG, or WebP image under 5 MB.':
    'Pilih gambar PNG, JPEG atau WebP di bawah 5 MB.',
  'Join as a participant to submit.': 'Masuk sebagai peserta untuk menghantar karya.',
  'Submissions are closed.': 'Penghantaran telah ditutup.',
  'Submissions just closed.': 'Penghantaran baru sahaja ditutup. Sila hubungi fasilitator.',
  'Your sticker is already approved.': 'Karya anda telah diluluskan.',
  'Use a valid, still PNG, JPEG, or WebP image (up to 20 megapixels).':
    'Gunakan gambar PNG, JPEG atau WebP yang sah dan tidak bergerak, sehingga 20 megapiksel.',
  'Cleanup authorization is invalid.':
    'Kebenaran pemadaman tidak sah. Log masuk semula sebagai fasilitator.',
  'Cleanup authorization is required.': 'Kebenaran fasilitator diperlukan untuk pemadaman.',
  'Workshop not found.': 'Sesi bengkel tidak ditemui.',
  'Explicit deletion confirmation is required.': 'Sahkan pemadaman sebelum meneruskan.',
  'Deletion could not be verified. Retry cleanup. The workshop remains closed.':
    'Pemadaman belum dapat disahkan. Cuba padam semula. Sesi kekal ditutup.',
  'Could not check deletion. Retry when connected.':
    'Status pemadaman tidak dapat disemak. Cuba semula apabila bersambung.',
  'Could not check unfinished cleanup. Refresh when connected.':
    'Pemadaman tertangguh tidak dapat disemak. Muat semula apabila bersambung.',
  'Something went wrong. Try again.': 'Tindakan tidak berjaya. Sila cuba semula.',
};

export function mesejMelayu(message: string): string {
  if (messages[message]) return messages[message];
  if (message.startsWith('Uploads are still'))
    return 'Muat naik masih sedang diselesaikan. Sesi kekal ditutup. Cuba padam semula sebentar lagi.';
  if (/auth\/popup-closed-by-user|auth\/cancelled-popup-request/.test(message))
    return 'Log masuk dibatalkan. Tekan butang log masuk untuk mencuba semula.';
  if (/auth\/popup-blocked/.test(message))
    return 'Browser menyekat tetingkap log masuk. Benarkan tetingkap timbul dan cuba semula.';
  if (/auth\/network-request-failed|Failed to fetch|Load failed|NetworkError/.test(message))
    return 'Sambungan terganggu. Semak internet anda dan cuba semula.';
  if (/Firebase:|auth\//.test(message))
    return 'Log masuk tidak berjaya. Semak akaun anda dan cuba semula.';
  return message;
}
