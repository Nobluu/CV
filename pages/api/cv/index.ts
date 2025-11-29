import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
// import clientPromise from '@/lib/mongodb'
import { authOptions } from '@/lib/auth'

// Mock data for testing without database
const mockCVs: any[] = []

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Using mock data instead of database
  // const client = await clientPromise
  // const db = client.db('cv-maker')
  // const cvCollection = db.collection('cvs')

  if (req.method === 'GET') {
    try {
      // Return mock CVs filtered by user email
      const userCVs = mockCVs.filter(cv => cv.userEmail === session.user.email)
      return res.status(200).json({ success: true, cvs: userCVs })
    } catch (error) {
      console.error('Error fetching CVs:', error)
      return res.status(500).json({ success: false, error: 'Failed to fetch CVs' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body

      // Create mock CV
      const newCV = {
        _id: Date.now().toString(), // Simple ID generation
        ...data,
        userEmail: session.user.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Add to mock storage
      mockCVs.push(newCV)

      const insertedCV = newCV

      return res.status(201).json({ success: true, cv: insertedCV })
    } catch (error) {
      console.error('Error creating CV:', error)
      return res.status(500).json({ success: false, error: 'Failed to create CV' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
