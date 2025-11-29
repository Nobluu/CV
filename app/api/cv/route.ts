import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('cv-maker')
    
    const cvs = await db.collection('cvs').find({ 
      userEmail: session.user.email 
    }).toArray()

    return NextResponse.json(cvs)
  } catch (error) {
    console.error('CV fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch CVs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cvData = await request.json()
    
    const client = await clientPromise
    const db = client.db('cv-maker')
    
    const newCV = {
      ...cvData,
      userEmail: session.user.email,
      userId: session.user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const result = await db.collection('cvs').insertOne(newCV)
    
    return NextResponse.json({ 
      id: result.insertedId, 
      ...newCV 
    })
  } catch (error) {
    console.error('CV save error:', error)
    return NextResponse.json({ error: 'Failed to save CV' }, { status: 500 })
  }
}