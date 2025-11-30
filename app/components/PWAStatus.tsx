'use client'

import { useState, useEffect } from 'react'
import { X, Download, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export default function PWAStatus() {
  const [isInstalled, setIsInstalled] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if already installed
    const checkIfInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const isIOSPWA = (window.navigator as any).standalone === true
      setIsInstalled(isStandalone || isIOSPWA)
    }

    checkIfInstalled()

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show install prompt only if not dismissed and not installed
      if (!dismissed && !isInstalled) {
        setShowInstallPrompt(true)
      }
    }

    // Check if user dismissed the prompt before
    const isDismissed = localStorage.getItem('pwa-install-dismissed') === 'true'
    setDismissed(isDismissed)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [dismissed, isInstalled])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        setIsInstalled(true)
        setShowInstallPrompt(false)
      }
      
      setDeferredPrompt(null)
    } catch (error) {
      console.error('Install prompt error:', error)
    }
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Don't show anything if installed or dismissed
  if (isInstalled || dismissed || !showInstallPrompt || !deferredPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-100 p-2 rounded-lg">
              <Smartphone className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">Install CV Maker</h3>
              <p className="text-xs text-gray-600 mt-1">
                Add to your home screen for quick access
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex space-x-2 mt-3">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-primary-600 text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center justify-center space-x-1"
          >
            <Download className="w-4 h-4" />
            <span>Install</span>
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}