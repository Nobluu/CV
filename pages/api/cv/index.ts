import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import clientPromise from '@/lib/mongodb'
import { authOptions } from '@/lib/auth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const client = await clientPromise
  const db = client.db('cv-maker')
  const cvCollection = db.collection('cvs')

  if (req.method === 'GET') {
    try {
      const cvs = await cvCollection
        .find({ userEmail: session.user.email })
        .sort({ updatedAt: -1 })
        .limit(10)
        .toArray()

      return res.status(200).json({ success: true, cvs })
    } catch (error) {
      console.error('Error fetching CVs:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch CVs' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body

      const newCV = await cvCollection.insertOne({
        ...data,
        userEmail: session.user.email,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const insertedCV = await cvCollection.findOne({ _id: newCV.insertedId })

      return res.status(201).json({ success: true, cv: insertedCV })
    } catch (error) {
      console.error('Error creating CV:', error)
      return res.status(500).json({ success: false, error: 'Failed to create CV' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
