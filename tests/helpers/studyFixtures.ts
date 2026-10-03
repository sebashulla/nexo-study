import type { Course } from '../../src/types'
import { demoCourses } from '../../src/data/demo'

// Explicit test fixtures replace the old assumption that new accounts get demos.
// Ready artifacts are fixtures; their presence never proves live model quality.
export const studyFixtureCourses: Course[] = demoCourses.map(course => ({...course,materials:course.materials.map(material => ({...material,sourceType:'text',processingStatus:'ready',analysisStatus:'ready',
  artifacts:[{id:'20000000-0000-4000-8000-000000000001',sourceMaterialId:material.id,type:'flashcards',status:'ready',version:1,createdAt:material.createdAt,updatedAt:material.createdAt,payload:{cards:Array.from({length:4},(_,index) => ({front:`¿Qué contiene el núcleo? ${index+1}`,back:'El núcleo contiene ADN.',concept:'Núcleo celular',sourcePage:1}))}},
  {id:'20000000-0000-4000-8000-000000000002',sourceMaterialId:material.id,type:'multiple_choice',status:'ready',version:1,createdAt:material.createdAt,updatedAt:material.createdAt,payload:{questions:[{question:'¿Dónde se encuentra el ADN?',options:['Núcleo','Membrana','Citoplasma','Ribosoma'],correctOption:0,explanation:'El núcleo contiene ADN.',concept:'Núcleo celular',sourcePage:1}]}}] }))}))
