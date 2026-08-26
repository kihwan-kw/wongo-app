// api/schedule.js — NEIS 학사일정 API 프록시 (Vercel Serverless Function)
// 환경변수: NEIS_API_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE (급식 API와 동일)

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query params are required (YYYYMMDD)' });
  }

  const KEY   = process.env.NEIS_API_KEY;
  const ATPT  = process.env.ATPT_OFCDC_SC_CODE;
  const SCHUL = process.env.SD_SCHUL_CODE;

  if (!KEY || !ATPT || !SCHUL) {
    return res.status(500).json({ error: 'API environment variables not configured', events: [] });
  }

  const url = new URL('https://open.neis.go.kr/hub/SchoolSchedule');
  url.searchParams.set('KEY',               KEY);
  url.searchParams.set('Type',              'json');
  url.searchParams.set('ATPT_OFCDC_SC_CODE', ATPT);
  url.searchParams.set('SD_SCHUL_CODE',     SCHUL);
  url.searchParams.set('AA_FROM_YMD',       from);
  url.searchParams.set('AA_TO_YMD',         to);
  url.searchParams.set('pSize',             '200');

  try {
    const apiRes  = await fetch(url.toString());
    const apiJson = await apiRes.json();

    // NEIS 학사일정 응답 파싱
    // 결과 없을 때: { RESULT: { CODE: 'INFO-200', ... } }
    if (apiJson?.RESULT?.CODE === 'INFO-200') {
      return res.status(200).json({ events: [] });
    }

    const rows = apiJson?.SchoolSchedule?.[1]?.row || [];
    const events = rows.map(r => ({
      date:  r.AA_YMD,       // YYYYMMDD
      title: r.EVENT_NM,     // 일정명
    })).filter(e => e.date && e.title);

    return res.status(200).json({ events });
  } catch (err) {
    console.error('[schedule API]', err);
    return res.status(502).json({ error: 'Failed to fetch NEIS schedule data', events: [] });
  }
}
