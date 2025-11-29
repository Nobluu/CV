import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'react-hot-toast'

interface CVData {
  _id?: string
  title: string
  personalInfo: any
  summary?: string
  experiences: any[]
  education: any[]
  skills: any[]
  certifications?: any[]
  languages?: any[]
  projects?: any[]
  template: any
  metadata?: any
}

export function useCVData(cvId?: string) {
  const { data: session } = useSession()
  const [cvData, setCVData] = useState<CVData | null>(null)
  const [allCVs, setAllCVs] = useState<CVData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load from localStorage immediately on mount (faster)
  useEffect(() => {
    const savedCV = localStorage.getItem('currentCV')
    if (savedCV) {
      try {
        const parsed = JSON.parse(savedCV)
        // Ensure title exists
        if (parsed && typeof parsed === 'object') {
          if (!parsed.title) {
            parsed.title = 'My CV'
          }
          setCVData(parsed)
        }
      } catch (error) {
        console.error('Error parsing saved CV from localStorage:', error)
        localStorage.removeItem('currentCV') // Clear corrupted data
      }
    }
  }, [])

  // Fetch all CVs for current user
  const fetchAllCVs = useCallback(async () => {
    if (!session?.user?.email) return

    try {
      setIsLoading(true)
      const response = await fetch('/api/cv')
      const result = await response.json()

      if (result.success) {
        // Sanitize CV data - ensure all CVs have title
        const cvs = result.cvs || []
        const sanitizedCVs = cvs.map((cv: any) => ({
          ...cv,
          title: cv.title || 'Untitled CV'
        }))
        setAllCVs(sanitizedCVs)
        
        // Load first CV if no specific CV selected
        if (!cvId && sanitizedCVs.length > 0) {
          setCVData(sanitizedCVs[0])
        }
      }
    } catch (error) {
      console.error('Error fetching CVs:', error)
      toast.error('Gagal memuat CV')
    } finally {
      setIsLoading(false)
    }
  }, [session, cvId])

  // Fetch specific CV
  const fetchCV = useCallback(async (id: string) => {
    if (!session?.user?.email) return

    try {
      setIsLoading(true)
      const response = await fetch(`/api/cv/${id}`)
      const result = await response.json()

      if (result.success) {
        setCVData(result.cv)
      } else {
        toast.error('CV tidak ditemukan')
      }
    } catch (error) {
      console.error('Error fetching CV:', error)
      toast.error('Gagal memuat CV')
    } finally {
      setIsLoading(false)
    }
  }, [session])

  // Create new CV
  const createCV = useCallback(async (data: Partial<CVData>) => {
    if (!session?.user?.email) {
      toast.error('Silakan login terlebih dahulu')
      return null
    }

    try {
      setIsSaving(true)
      const response = await fetch('/api/cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Create CV API error:', result)
        toast.error(result.error || 'Gagal membuat CV')
        return null
      }

      if (result.success || result.data) {
        toast.success('CV berhasil dibuat!')
        setCVData(result.data)
        setLastSaved(new Date())
        await fetchAllCVs() // Refresh list
        return result.data
      } else {
        console.error('Unexpected response format:', result)
        toast.error(result.error || 'Gagal membuat CV')
        return null
      }
    } catch (error) {
      console.error('Error creating CV:', error)
      toast.error('Gagal membuat CV')
      return null
    } finally {
      setIsSaving(false)
    }
  }, [session, fetchAllCVs])

  // Update CV
  const updateCV = useCallback(async (id: string, data: Partial<CVData>) => {
    if (!session?.user?.email) {
      toast.error('Silakan login terlebih dahulu')
      return false
    }

    try {
      setIsSaving(true)
      const response = await fetch(`/api/cv/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Update CV API error:', result)
        toast.error(result.error || 'Gagal menyimpan CV')
        return false
      }

      if (result.success || result.data) {
        setCVData(result.data)
        setLastSaved(new Date())
        await fetchAllCVs() // Refresh list
        
        // Create history snapshot after successful update
        await createSnapshot(id, 'Auto-save')
        
        return true
      } else {
        console.error('Unexpected response format:', result)
        toast.error(result.error || 'Gagal menyimpan CV')
        return false
      }
    } catch (error) {
      console.error('Error updating CV:', error)
      toast.error('Gagal menyimpan CV')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [session, fetchAllCVs])

  // Delete CV
  const deleteCV = useCallback(async (id: string) => {
    if (!session?.user?.email) {
      toast.error('Silakan login terlebih dahulu')
      return false
    }

    try {
      const response = await fetch(`/api/cv/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        toast.success('CV berhasil dihapus')
        await fetchAllCVs() // Refresh list
        setCVData(null)
        return true
      } else {
        toast.error(result.error || 'Gagal menghapus CV')
        return false
      }
    } catch (error) {
      console.error('Error deleting CV:', error)
      toast.error('Gagal menghapus CV')
      return false
    }
  }, [session, fetchAllCVs])

  // Create history snapshot
  const createSnapshot = useCallback(async (cvId: string, description: string) => {
    try {
      await fetch(`/api/cv/${cvId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeDescription: description }),
      })
      // Silent - don't show toast for auto-snapshots
    } catch (error) {
      console.error('Error creating snapshot:', error)
    }
  }, [])

  // Auto-save function (debounced, silent mode)
  const autoSave = useCallback(async (data: CVData) => {
    if (!session?.user?.email) {
      console.log('Auto-save skipped: No session')
      return
    }

    try {
      if (!data._id) {
        // Create new CV silently
        console.log('Auto-save: Creating new CV')
        const response = await fetch('/api/cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        const result = await response.json()

        if (response.ok && (result.success || result.data)) {
          console.log('Auto-save: CV created successfully')
          setCVData(result.data)
          setLastSaved(new Date())
          await fetchAllCVs() // Refresh list
        } else {
          console.error('Auto-save create failed:', result)
        }
      } else {
        // Update existing CV silently
        console.log('Auto-save: Updating CV', data._id)
        const response = await fetch(`/api/cv/${data._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        const result = await response.json()

        if (response.ok && (result.success || result.data)) {
          console.log('Auto-save: CV updated successfully')
          setCVData(result.data)
          setLastSaved(new Date())
          
          // Create silent snapshot
          await createSnapshot(data._id, 'Auto-save')
        } else {
          console.error('Auto-save update failed:', result)
        }
      }
    } catch (error) {
      console.error('Auto-save error:', error)
      // Silent fail - don't show toast for auto-save errors
    }
  }, [session, fetchAllCVs, createSnapshot])

  // Load CVs on mount
  useEffect(() => {
    if (session?.user?.email) {
      if (cvId) {
        fetchCV(cvId)
      } else {
        fetchAllCVs()
      }
    }
  }, [session, cvId, fetchCV, fetchAllCVs])

  // LocalStorage sync for offline support
  useEffect(() => {
    if (cvData) {
      localStorage.setItem('currentCV', JSON.stringify(cvData))
    }
  }, [cvData])

  return {
    cvData,
    setCVData,
    allCVs,
    isLoading,
    isSaving,
    lastSaved,
    createCV,
    updateCV,
    deleteCV,
    autoSave,
    fetchAllCVs,
    fetchCV,
  }
}
