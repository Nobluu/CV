import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

interface Params {
  id: string
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('cv-maker')
    
    const cv = await db.collection('cvs').findOne({ 
      _id: new ObjectId(params.id),
      userEmail: session.user.email 
    })

    if (!cv) {
      return NextResponse.json({ error: 'CV not found' }, { status: 404 })
    }

    return NextResponse.json(cv)
  } catch (error) {
    console.error('CV fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch CV' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cvData = await request.json()
    
    const client = await clientPromise
    const db = client.db('cv-maker')
    
    const result = await db.collection('cvs').updateOne(
      { 
        _id: new ObjectId(params.id),
        userEmail: session.user.email 
      },
      { 
        $set: {
          ...cvData,
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'CV not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CV update error:', error)
    return NextResponse.json({ error: 'Failed to update CV' }, { status: 500 })
  }
}