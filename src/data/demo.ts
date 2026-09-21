import type { Course } from '../types'

export const demoCourses: Course[] = [
  {
    id: 'course-bio',
    name: 'Biología',
    emoji: '🧬',
    materials: [
      {
        id: 'mat-cell',
        title: 'Introducción a la célula',
        createdAt: new Date().toISOString(),
        text:
          'La célula es la unidad estructural y funcional básica de los seres vivos. Las células procariotas no poseen un núcleo delimitado por membrana, mientras que las células eucariotas sí presentan un núcleo definido. La membrana plasmática regula el intercambio de sustancias con el medio. Las mitocondrias participan en la producción de ATP mediante la respiración celular. Los ribosomas realizan la síntesis de proteínas. El ADN almacena la información genética de la célula.'
      }
    ]
  },
  {
    id: 'course-chem',
    name: 'Química',
    emoji: '⚗️',
    materials: []
  },
  {
    id: 'course-anatomy',
    name: 'Anatomía',
    emoji: '🫀',
    materials: []
  }
]
