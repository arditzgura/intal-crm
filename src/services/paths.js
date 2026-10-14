import { collection, doc } from 'firebase/firestore'
import { db, COMPANY_ID } from '../firebase'

export const companyCol = (name) => collection(db, 'companies', COMPANY_ID, name)
export const companyDoc = (name, id) => doc(db, 'companies', COMPANY_ID, name, id)
export const newDocRef = (name) => doc(companyCol(name))
