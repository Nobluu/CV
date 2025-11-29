'use client'

import { useState, useEffect } from 'react'
import { Check, Wifi, WifiOff, Download, Smartphone, Globe } from 'lucide-react'

export default function PWAStatus() {
  const [isPWA, setIsPWA] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [canInstall, setCanInstall] = useState(false)
  const [swRegistration, setSWRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    // Check if running as PWA
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-ignore
      window.navigator.standalone === true

    setIsPWA(isStandalone)

    // Check online status
    setIsOnline(navigator.onLine)
    
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check if service worker is registered
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSWRegistration(registration)
      })
    }

    // Check if can install
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setCanInstall(true)
    }

    // @ts-ignore
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      // @ts-ignore
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  return (
    <div className="fixed top-4 left-4 z-50">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-900">PWA Status</h3>
          <div className="flex space-x-1">
            {isPWA && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
            {swRegistration && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
            {isOnline ? <div className="w-2 h-2 bg-green-500 rounded-full"></div> : <div className="w-2 h-2 bg-red-500 rounded-full"></div>}
          </div>
        </div>
        
        <div className="space-y-1 text-xs">
          <div className="flex items-center space-x-2">
            {isPWA ? (
              <>
                <Smartphone className="w-3 h-3 text-green-600" />
                <span className="text-green-600 font-medium">Running as PWA</span>
              </>
            ) : (
              <>
                <Globe className="w-3 h-3 text-blue-600" />
                <span className="text-blue-600">Web App</span>
              </>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {swRegistration ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                <span className="text-green-600">Service Worker Active</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500">Service Worker Loading...</span>
              </>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-green-600" />
                <span className="text-green-600">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-red-600" />
                <span className="text-red-600">Offline</span>
              </>
            )}
          </div>

          {canInstall && (
            <div className="flex items-center space-x-2">
              <Download className="w-3 h-3 text-blue-600" />
              <span className="text-blue-600">Can Install</span>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">
          {isPWA ? '🎉 PWA Features Active!' : '💡 Installable as PWA'}
        </div>
      </div>
    </div>
  )
}