export class RelationalRequestError extends Error {
  constructor(message:string,public status:number){super(message)}
}
export async function relationalRequest<T=any>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/relational${path}`,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new RelationalRequestError(result.error||'Не удалось выполнить запрос.',response.status);
  return result as T;
}
export const part=(value:string)=>encodeURIComponent(value);
