import manifest from '../../content/manifest.json'
import labor from '../../content/courses/labor-arbitration.json'
import returnProperty from '../../content/courses/return-property.json'
import loan from '../../content/courses/obtaining-loan-by-fraud.json'
import family from '../../content/courses/cross-border-family.json'
import divorce from '../../content/courses/post-divorce-property.json'
import digital from '../../content/courses/digital-assets.json'
import trademark from '../../content/courses/trademark-transfer.json'
import equity from '../../content/courses/equity-design.json'
import fall from '../../content/courses/elder-care-fall.json'
import choking from '../../content/courses/elder-care-choking.json'
import type { Course, CourseContent } from '../domain/types'

const courses = [labor, returnProperty, loan, family, divorce, digital, trademark, equity, fall, choking] as Course[]

export const courseContent: CourseContent = {
  contentVersion: manifest.contentVersion,
  status: manifest.status as CourseContent['status'],
  courses,
}

export const allCards = courses.flatMap((course) => course.cards)
export const cardById = new Map(allCards.map((card) => [card.id, card]))
