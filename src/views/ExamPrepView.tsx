import React, { useState, useEffect } from 'react';
import { getExams, subscribeToDatabase } from '../services/storage';

interface ExamPrepViewProps { navigate: (route: string) => void }

export const ExamPrepView: React.FC<ExamPrepViewProps> = ({ navigate }) => {
  const [exams, setExams] = useState(getExams().filter(e => e.type === 'exam' && e.status === 'published'));
  const [selected, setSelected] = useState('');
  useEffect(() => subscribeToDatabase(() => setExams(getExams().filter(e => e.type === 'exam' && e.status === 'published'))), []);
  const exam = exams.find(e => e.id === selected) || exams[0];
  return <div className="max-w-5xl mx-auto p-6 space-y-6 text-slate-200">
    <h1 className="text-2xl font-bold">Открытый экзаменационный банк</h1>
    {!exam ? <p>Опубликованных экзаменационных банков пока нет. Материалы появятся после утверждения ментором.</p> : <>
      <label>Экзамен <select value={exam.id} onChange={e => setSelected(e.target.value)} className="bg-slate-800 p-2 rounded">
        {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select></label>
      <p>Все опубликованные билеты доступны для подготовки. Во время аттестации подсказки не используются.</p>
      {exam.tickets.map((ticket, i) => <article key={ticket.ticketId} className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-3">
        <h2 className="font-bold text-cyan-300">Билет {i + 1} · {ticket.ticketId}</h2>
        <p><b>Теория 1:</b> {ticket.theory1}</p><p><b>Теория 2:</b> {ticket.theory2}</p><p><b>Практика:</b> {ticket.practical}</p>
      </article>)}
      <button className="rounded bg-cyan-500 px-4 py-2 text-slate-950" onClick={() => navigate('/assessments')}>Перейти к аттестациям</button>
    </>}
  </div>;
};
