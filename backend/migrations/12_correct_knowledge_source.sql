-- Repair only the original migration-11 seed with a nonexistent source URL.
-- Preserve edited records. Publication must follow a new explicit ROPS verification.
UPDATE public.knowledge_resources
SET title = 'Inkubator Włączenia Społecznego — finalista REGIOSTARS Awards 2025',
    description = 'Strona ROPS Kraków prezentująca Inkubator Włączenia Społecznego jako finalistę REGIOSTARS Awards 2025. Opisuje rozwój i testowanie pomysłów oraz ośmioetapowy model inkubacji.',
    kind = 'Strona tematyczna',
    url = 'https://rops.krakow.pl/innowacje-spoleczne/regiostars-awards-2025/pl-inkubator-wlaczenia-spolecznego',
    caveat = NULL,
    status = 'roboczy',
    verified_by = NULL, verified_at = NULL,
    published_by = NULL, published_at = NULL,
    updated_at = now()
WHERE id = 'video-inkubator-iws'
  AND url = 'https://rops.krakow.pl/innowacje-spoleczne/filmy-i-dobre-praktyki'
  AND title = 'Inkubator Włączenia Społecznego – Filmy i dobre praktyki';
