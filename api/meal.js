// api/meal.js — NEIS 급식 API 프록시 (Vercel Serverless Function)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params are required (YYYYMMDD)' });
  }

  const KEY      = process.env.NEIS_API_KEY;
  const ATPT     = process.env.ATPT_OFCDC_SC_CODE;
  const SCHUL    = process.env.SD_SCHUL_CODE;

  if (!KEY || !ATPT || !SCHUL) {
    return res.status(500).json({ error: 'API environment variables not configured' });
  }

  const url = new URL('https://open.neis.go.kr/hub/mealServiceDietInfo');
  url.searchParams.set('KEY',              KEY);
  url.searchParams.set('Type',             'json');
  url.searchParams.set('ATPT_OFCDC_SC_CODE', ATPT);
  url.searchParams.set('SD_SCHUL_CODE',    SCHUL);
  url.searchParams.set('MLSV_FROM_YMD',   from);
  url.searchParams.set('MLSV_TO_YMD',     to);
  url.searchParams.set('pSize',            '100');

  try {
    const apiRes  = await fetch(url.toString());
    const apiJson = await apiRes.json();

    // NEIS 응답 파싱
    const rows = apiJson?.mealServiceDietInfo?.[1]?.row || [];
    const meals = rows.map(r => ({
      date: r.MLSV_YMD,                          // YYYYMMDD
      menu: (r.DDISH_NM || '')
              .replace(/<br\/>/g, '\n')          // 줄바꿈 변환
              .replace(/\d+\./g, '')             // 알러지 번호 제거
              .trim(),
    }));

    return res.status(200).json({ meals });
  } catch (err) {
    console.error('[meal API]', err);
    return res.status(502).json({ error: 'Failed to fetch NEIS meal data', meals: [] });
  }
}
