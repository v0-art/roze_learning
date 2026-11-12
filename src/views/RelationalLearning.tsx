import React,{useEffect,useState} from 'react';
import {part,relationalRequest} from '../services/relational';
import {RelationalMentorLearning} from './RelationalMentorLearning';
import {RelationalStudentLearning} from './RelationalStudentLearning';
import {RelationalV3StudentLearning,type V3Course} from './RelationalV3StudentLearning';

type Curriculum={modules:any[];topics:any[];lessons:any[];exams:any[]};
type Attempt={lesson_id:string;status:string};
type Props={courseId:string;studentId:string;mentor:boolean;requestedLessonId?:string;onChange:()=>void};

export function RelationalLearning({courseId,studentId,mentor,requestedLessonId='',onChange}:Props){
 const [plan,setPlan]=useState<Curriculum|null>(null),[attempts,setAttempts]=useState<Attempt[]>([]),[error,setError]=useState('');
 const [v3,setV3]=useState<V3Course|null>(null);
 const base=`/courses/${part(courseId)}`;
 useEffect(()=>{let active=true;setPlan(null);setV3(null);setError('');
  void Promise.all([relationalRequest<Curriculum>(`${base}/curriculum`),mentor?Promise.resolve([]):relationalRequest<Attempt[]>(`${base}/students/${part(studentId)}/attempts`),relationalRequest<any[]>(`${base}/exams`),mentor?Promise.resolve(null):relationalRequest<V3Course>(`${base}/students/${part(studentId)}/course-v3`)]).then(([data,rows,exams,newCourse])=>{if(active){setPlan({...data,exams});setAttempts(rows);setV3(newCourse)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить учебный план.')});return()=>{active=false};
 },[courseId,studentId,mentor]);
 async function refreshPlan(){const [data,exams]=await Promise.all([relationalRequest<Curriculum>(`${base}/curriculum`),relationalRequest<any[]>(`${base}/exams`)]);setPlan({...data,exams});onChange()}
 async function refreshAttempts(){setAttempts(await relationalRequest<Attempt[]>(`${base}/students/${part(studentId)}/attempts`));onChange()}
 if(error&&!plan)return <p role="alert" className="text-rose-300">{error}</p>;
 if(!plan)return <p className="text-violet-200">Загружаем учебный план…</p>;
 if(mentor)return <RelationalMentorLearning courseId={courseId} plan={plan} onChange={refreshPlan}/>;
 if(v3?.enabled)return <RelationalV3StudentLearning key={courseId} courseId={courseId} studentId={studentId} course={v3} requestedLessonId={requestedLessonId} onSaved={async()=>{setV3(await relationalRequest<V3Course>(`${base}/students/${part(studentId)}/course-v3`));onChange()}}/>;
 return <RelationalStudentLearning courseId={courseId} studentId={studentId} plan={plan} attempts={attempts} requestedLessonId={requestedLessonId} onStarted={id=>setPlan(current=>current&&({...current,lessons:current.lessons.map(lesson=>lesson.id===id?{...lesson,started:true}:lesson)}))} onSaved={refreshAttempts}/>;
}
