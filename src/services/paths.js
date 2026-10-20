import { collection, doc } from 'firebase/firestore'
import { db, getCompanyId } from '../firebase'

export const companyCol = (name) => collection(db, 'companies', getCompanyId(), name)
export const companyDoc = (name, id) => doc(db, 'companies', getCompanyId(), name, id)
export const newDocRef = (name) => doc(companyCol(name))
