import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { authOptions } from '@/lib/auth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid ID' })
  }

  const session = await getServerSession(req, res, authOptions)
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const client = await clientPromise
  const db = client.db('cv-maker')
  const cvCollection = db.collection('cvs')

  if (req.method === 'GET') {
    try {
      const cv = await cvCollection.findOne({
        _id: new ObjectId(id),
        userEmail: session.user.email
      })

      if (!cv) {
        return res.status(404).json({ error: 'CV not found' })
      }

      return res.status(200).json({ success: true, cv })
    } catch (error) {
      console.error('Error fetching CV:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch CV' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const data = req.body

      const updatedCV = await cvCollection.updateOne(
        {
          _id: new ObjectId(id),
          userEmail: session.user.email
        },
        { 
          $set: { 
            ...data, 
            updatedAt: new Date() 
          } 
        }
      )

      if (updatedCV.matchedCount === 0) {
        return res.status(404).json({ error: 'CV not found' })
      }

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error updating CV:', error)
      return res.status(500).json({ success: false, error: 'Failed to update CV' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const deletedCV = await cvCollection.deleteOne({
        _id: new ObjectId(id),
        userEmail: session.user.email
      })

      if (deletedCV.deletedCount === 0) {
        return res.status(404).json({ error: 'CV not found' })
      }

      return res.status(200).json({ success: true })
    } catch (error) {
      console.error('Error deleting CV:', error)
      return res.status(500).json({ success: false, error: 'Failed to delete CV' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
