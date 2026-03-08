'use client';

import { useAuthUser, useAuthSession } from '@/lib/auth-provider/client';
import { useEffect, useState } from 'react';
import { formatDate } from '../../lib/formatDate';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMobile, 
  faDesktop, 
  faTablet, 
  faLaptop, 
  faGlobe,
  faMapMarkerAlt,
  faWifi
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/Toast';
import { toError } from '../../lib/runtime-guards';

interface SessionActivity {
  id: string;
  browserName?: string;
  browserVersion?: string;
  deviceType?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  isMobile?: boolean;
}

interface SessionWithActivity {
  id: string;
  status: string;
  lastActiveAt: string | Date;
  latestActivity?: SessionActivity;
  actor?: unknown;
}

// Convert unknown error to a safe string message for UI/logging
function safeErrorMessage(err: unknown): string {
  return toError(err).message || 'Unknown error';
}

// Helper: convert ISO-2 country code into flag emoji
function isoCodeToFlagEmoji(code: string): string {
  if (!code || typeof code !== 'string') return '🌍';
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2) return '🌍';
  const A = 0x1F1E6;
  const first = upper.charCodeAt(0);
  const second = upper.charCodeAt(1);
  if (first < 65 || first > 90 || second < 65 || second > 90) return '🌍';
  return String.fromCodePoint(A + (first - 65), A + (second - 65));
}

// Map many country names and common variants to ISO-2 codes. Keys are normalized lowercase.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'afghanistan': 'AF',
  'aland islands': 'AX',
  'albania': 'AL',
  'algeria': 'DZ',
  'american samoa': 'AS',
  'andorra': 'AD',
  'angola': 'AO',
  'anguilla': 'AI',
  'antarctica': 'AQ',
  'antigua and barbuda': 'AG',
  'argentina': 'AR',
  'armenia': 'AM',
  'aruba': 'AW',
  'australia': 'AU',
  'austria': 'AT',
  'azerbaijan': 'AZ',
  'bahamas': 'BS',
  'bahrain': 'BH',
  'bangladesh': 'BD',
  'barbados': 'BB',
  'belarus': 'BY',
  'belgium': 'BE',
  'belize': 'BZ',
  'benin': 'BJ',
  'bermuda': 'BM',
  'bhutan': 'BT',
  'bolivia': 'BO',
  'bosnia and herzegovina': 'BA',
  'botswana': 'BW',
  'bouvet island': 'BV',
  'brazil': 'BR',
  'british indian ocean territory': 'IO',
  'brunei darussalam': 'BN',
  'bulgaria': 'BG',
  'burkina faso': 'BF',
  'burundi': 'BI',
  'cambodia': 'KH',
  'cameroon': 'CM',
  'canada': 'CA',
  'cape verde': 'CV',
  'cayman islands': 'KY',
  'central african republic': 'CF',
  'chad': 'TD',
  'chile': 'CL',
  'china': 'CN',
  'christmas island': 'CX',
  'cocos islands': 'CC',
  'colombia': 'CO',
  'comoros': 'KM',
  'congo': 'CG',
  'congo democratic republic': 'CD',
  'cook islands': 'CK',
  'costa rica': 'CR',
  'cote d\'ivoire': 'CI',
  'croatia': 'HR',
  'cuba': 'CU',
  'cyprus': 'CY',
  'czech republic': 'CZ',
  'denmark': 'DK',
  'djibouti': 'DJ',
  'dominica': 'DM',
  'dominican republic': 'DO',
  'ecuador': 'EC',
  'egypt': 'EG',
  'el salvador': 'SV',
  'equatorial guinea': 'GQ',
  'eritrea': 'ER',
  'estonia': 'EE',
  'eswatini': 'SZ',
  'ethiopia': 'ET',
  'falkland islands': 'FK',
  'faroe islands': 'FO',
  'fiji': 'FJ',
  'finland': 'FI',
  'france': 'FR',
  'french guiana': 'GF',
  'french polynesia': 'PF',
  'gabon': 'GA',
  'gambia': 'GM',
  'georgia': 'GE',
  'germany': 'DE',
  'ghana': 'GH',
  'gibraltar': 'GI',
  'greece': 'GR',
  'greenland': 'GL',
  'grenada': 'GD',
  'guadeloupe': 'GP',
  'guam': 'GU',
  'guatemala': 'GT',
  'guernsey': 'GG',
  'guinea': 'GN',
  'guinea bissau': 'GW',
  'guyana': 'GY',
  'haiti': 'HT',
  'heard island and mcdonald islands': 'HM',
  'honduras': 'HN',
  'hong kong': 'HK',
  'hungary': 'HU',
  'iceland': 'IS',
  'india': 'IN',
  'indonesia': 'ID',
  'iran': 'IR',
  'iraq': 'IQ',
  'ireland': 'IE',
  'isle of man': 'IM',
  'israel': 'IL',
  'italy': 'IT',
  'jamaica': 'JM',
  'japan': 'JP',
  'jersey': 'JE',
  'jordan': 'JO',
  'kazakhstan': 'KZ',
  'kenya': 'KE',
  'kiribati': 'KI',
  'kosovo': 'XK',
  'kuwait': 'KW',
  'kyrgyzstan': 'KG',
  'laos': 'LA',
  'latvia': 'LV',
  'lebanon': 'LB',
  'lesotho': 'LS',
  'liberia': 'LR',
  'libya': 'LY',
  'liechtenstein': 'LI',
  'lithuania': 'LT',
  'luxembourg': 'LU',
  'macao': 'MO',
  'madagascar': 'MG',
  'malawi': 'MW',
  'malaysia': 'MY',
  'maldives': 'MV',
  'mali': 'ML',
  'malta': 'MT',
  'marshall islands': 'MH',
  'martinique': 'MQ',
  'mauritania': 'MR',
  'mauritius': 'MU',
  'mayotte': 'YT',
  'mexico': 'MX',
  'micronesia': 'FM',
  'moldova': 'MD',
  'monaco': 'MC',
  'mongolia': 'MN',
  'montenegro': 'ME',
  'montserrat': 'MS',
  'morocco': 'MA',
  'mozambique': 'MZ',
  'myanmar': 'MM',
  'namibia': 'NA',
  'nauru': 'NR',
  'nepal': 'NP',
  'netherlands': 'NL',
  'new caledonia': 'NC',
  'new zealand': 'NZ',
  'nicaragua': 'NI',
  'niger': 'NE',
  'nigeria': 'NG',
  'niue': 'NU',
  'norfolk island': 'NF',
  'north korea': 'KP',
  'north macedonia': 'MK',
  'northern mariana islands': 'MP',
  'norway': 'NO',
  'oman': 'OM',
  'pakistan': 'PK',
  'palau': 'PW',
  'palestine': 'PS',
  'panama': 'PA',
  'papua new guinea': 'PG',
  'paraguay': 'PY',
  'peru': 'PE',
  'philippines': 'PH',
  'pitcairn': 'PN',
  'poland': 'PL',
  'portugal': 'PT',
  'puerto rico': 'PR',
  'qatar': 'QA',
  'reunion': 'RE',
  'romania': 'RO',
  'russian federation': 'RU',
  'russia': 'RU',
  'rwanda': 'RW',
  'saint kitts and nevis': 'KN',
  'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC',
  'samoa': 'WS',
  'san marino': 'SM',
  'sao tome and principe': 'ST',
  'saudi arabia': 'SA',
  'senegal': 'SN',
  'serbia': 'RS',
  'seychelles': 'SC',
  'sierra leone': 'SL',
  'singapore': 'SG',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'solomon islands': 'SB',
  'somalia': 'SO',
  'south africa': 'ZA',
  'south georgia and the south sandwich islands': 'GS',
  'south korea': 'KR',
  'south sudan': 'SS',
  'spain': 'ES',
  'sri lanka': 'LK',
  'sudan': 'SD',
  'suriname': 'SR',
  'svalbard and jan mayen': 'SJ',
  'sweden': 'SE',
  'switzerland': 'CH',
  'syrian arab republic': 'SY',
  'taiwan': 'TW',
  'tajikistan': 'TJ',
  'tanzania': 'TZ',
  'thailand': 'TH',
  'timor leste': 'TL',
  'togo': 'TG',
  'tokelau': 'TK',
  'tonga': 'TO',
  'trinidad and tobago': 'TT',
  'tunisia': 'TN',
  'turkey': 'TR',
  'turkmenistan': 'TM',
  'turks and caicos islands': 'TC',
  'tuvalu': 'TV',
  'uganda': 'UG',
  'ukraine': 'UA',
  'united arab emirates': 'AE',
  'united kingdom': 'GB',
  'united states': 'US',
  'united states of america': 'US',
  'united states virgin islands': 'VI',
  'uruguay': 'UY',
  'uzbekistan': 'UZ',
  'vanuatu': 'VU',
  'venezuela': 'VE',
  'vietnam': 'VN',
  'british virgin islands': 'VG',
  'wallis and futuna': 'WF',
  'western sahara': 'EH',
  'yemen': 'YE',
  'zambia': 'ZM',
  'zimbabwe': 'ZW'
};

function getCountryFlag(countryName?: string): string {
  if (!countryName) return '🌍';
  const raw = countryName.trim();
  if (!raw) return '🌍';

  // If it's already an ISO-2 code
  if (/^[A-Za-z]{2}$/.test(raw)) return isoCodeToFlagEmoji(raw);

  // Try to extract ISO code in parentheses like "United States (US)"
  const paren = raw.match(/\(([A-Za-z]{2})\)/);
  if (paren && paren[1]) return isoCodeToFlagEmoji(paren[1]);

  const key = raw.toLowerCase();
  if (COUNTRY_NAME_TO_ISO[key]) return isoCodeToFlagEmoji(COUNTRY_NAME_TO_ISO[key]);

  // Try stripping common prefixes/suffixes and re-match
  const cleaned = key.replace(/\s+\(.+\)$/, '').replace(/[^a-z\s]/g, '').trim();
  if (COUNTRY_NAME_TO_ISO[cleaned]) return isoCodeToFlagEmoji(COUNTRY_NAME_TO_ISO[cleaned]);

  // Try last 2-letter token (e.g., "XYZ, US")
  const tokens = raw.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (last && /^[A-Za-z]{2}$/.test(last)) return isoCodeToFlagEmoji(last);

  // No mapping found — return generic globe
  return '🌍';
}

// Helper function to get device icon and type
function getDeviceInfo(deviceType?: string, isMobile?: boolean) {
  if (isMobile) {
    return {
      icon: faMobile,
      type: 'Mobile Device',
      color: 'text-neutral-400'
    };
  }
  
  if (deviceType) {
    const type = deviceType.toLowerCase();
    if (type.includes('tablet') || type.includes('ipad')) {
      return {
        icon: faTablet,
        type: 'Tablet',
        color: 'text-blue-400'
      };
    }
    if (type.includes('laptop') || type.includes('macbook')) {
      return {
        icon: faLaptop,
        type: 'Laptop',
        color: 'text-purple-400'
      };
    }
    if (type.includes('desktop') || type.includes('pc')) {
      return {
        icon: faDesktop,
        type: 'Desktop',
        color: 'text-orange-400'
      };
    }
  }
  
  // Default to desktop
  return {
    icon: faDesktop,
    type: 'Desktop Device',
    color: 'text-neutral-400'
  };
}

export function ActiveSessionsList() {
  const { user, isLoaded } = useAuthUser();
  const { sessionId: currentSessionId } = useAuthSession();
  const [sessions, setSessions] = useState<SessionWithActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }

    // Use the frontend API to get sessions with activity data
    const fetchSessions = async () => {
      try {
        // This calls the same frontend API that Clerk's profile modal uses
        const sessionsData = await user.getSessions();
        // sessionsData may come from Clerk SDK and can be an array-like shape.
        // We coerce safely here and rely on runtime guards in the UI below.
        setSessions((sessionsData as unknown) as SessionWithActivity[] || []);
      } catch (error) {
        const msg = safeErrorMessage(error);
        console.warn('Failed to fetch sessions with activity:', msg);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [user, isLoaded]);

  if (!isLoaded || loading) {
    return (
      <div className="lg:p-6 p-3 sm:p-4">
        <div className="text-sm text-neutral-500">Loading session data...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="lg:p-6 p-3 sm:p-4">
        <div className="text-sm text-neutral-500">Please sign in to view sessions.</div>
      </div>
    );
  }

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'pending');

  // Sort sessions by lastActiveAt to find the most recently active session
  const sortedSessions = [...activeSessions].sort((a, b) => {
    const aTime = new Date(a.lastActiveAt).getTime();
    const bTime = new Date(b.lastActiveAt).getTime();
    return bTime - aTime; // Most recent first
  });

  // If we have an explicit current session id from Clerk, ensure that session
  // is displayed at the top of the list so it doesn't momentarily jump while
  // lastActiveAt updates propagate.
  if (currentSessionId) {
    const idx = sortedSessions.findIndex(s => s.id === currentSessionId);
    if (idx > 0) {
      const [curr] = sortedSessions.splice(idx, 1);
      sortedSessions.unshift(curr);
    }
  }

  return (
    <div className="lg:p-6 p-3 sm:p-4">
      <div className="flex justify-between items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
            {activeSessions.length}
          </div>
          <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">active session{activeSessions.length !== 1 ? 's' : ''}</div>
        </div>

        <div>
          <button
            disabled={bulkRevoking || !currentSessionId || activeSessions.length <= 1}
            onClick={() => setConfirmBulkOpen(true)}
            className="text-[13px] text-amber-400 hover:text-white px-2 py-1 rounded border border-neutral-700 disabled:opacity-50"
          >
            Sign out other sessions
          </button>
        </div>
      </div>
      
      

      {activeSessions.length === 0 ? (
        <div className="text-sm text-neutral-500">No active sessions found for this user.</div>
      ) : (
        <div className="space-y-3">
          {sortedSessions.map((session: SessionWithActivity) => {
            const act = session.latestActivity;
            const browser = act?.browserName 
              ? `${act.browserName}${act?.browserVersion ? ' ' + act.browserVersion : ''}` 
              : 'Browser info not available';
            
            // Get enhanced device info with icons
            const deviceInfo = getDeviceInfo(act?.deviceType, act?.isMobile);
            
            const ip = act?.ipAddress || null;
            const location = act ? [act?.city, act?.country].filter(Boolean).join(', ') || null : null;
            const countryFlag = getCountryFlag(act?.country);
            
            // Determine if this is the current session. Prefer explicit Clerk session id
            // from the browser (more accurate). Fall back to the most-recently-active
            // heuristic if the session id isn't available (older Clerk versions).
            let isCurrentSession = false;
            if (currentSessionId) {
              isCurrentSession = session.id === currentSessionId;
            } else {
              isCurrentSession = session.id === sortedSessions[0]?.id;
            }
            
            return (
              <div key={session.id} className={`p-4 border rounded-lg transition-all hover:border-neutral-600 ${
                isCurrentSession
                  ? 'border-blue-500/60 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-950/20'
                  : 'border-neutral-700 bg-transparent'
              }`}>
                <div className="flex flex-col sm:flex-row justify-between items-start">
                  <div className="flex-1">
                    {/* Device type with icon */}
                    <div className="flex items-center gap-2 mb-2">
                      <FontAwesomeIcon 
                        icon={deviceInfo.icon} 
                        className={`${deviceInfo.color} text-lg`}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 dark:text-neutral-100">
                          {deviceInfo.type}
                        </span>
                        {act?.deviceType && (
                          <span className="text-xs text-neutral-500 font-bold">
                            {act.deviceType}
                          </span>
                        )}
                      </div>
                        {isCurrentSession && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full dark:bg-blue-600 dark:text-white">
                            Current
                          </span>
                        )}
                    </div>
                    
                    {/* Browser info */}
                    <div className="text-sm text-neutral-400 mb-1 flex items-center gap-2">
                      <FontAwesomeIcon icon={faGlobe} className="text-neutral-500" />
                      {browser}
                    </div>
                    
                    {/* Location with flag and icon */}
                    <div className="text-sm text-neutral-400 flex items-center gap-2">
                      <FontAwesomeIcon icon={faMapMarkerAlt} className="text-neutral-500" />
                      {location ? (
                        <span className="flex items-center gap-1">
                          <span className="text-base">{countryFlag}</span>
                          {location}
                        </span>
                      ) : (
                        <span>Location not available</span>
                      )}
                    </div>
                  </div>

                  {/* Session details */}
                  <div className="w-full sm:w-auto text-left sm:text-right text-xs text-neutral-500 space-y-1 mt-3 sm:mt-0">
                    {ip && (
                      <div className="flex items-center gap-1 justify-end">
                        <FontAwesomeIcon icon={faWifi} className="text-neutral-600" />
                        <span>{ip}</span>
                      </div>
                    )}
                    {session.lastActiveAt && (
                      <div className="text-neutral-400">Last active: {formatDate(session.lastActiveAt, { mode: 'datetime' })}</div>
                    )}
                    <div className="font-mono">#{session.id.slice(-8)}</div>
                    {(() => {
                      const status = String(session.status || '').toLowerCase();
                      const statusClasses = status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-yellow-900/30 dark:text-yellow-400';
                      return (
                        <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusClasses}`}>
                          {session.status}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  {isCurrentSession ? (
                    <div className="text-sm text-neutral-400">This is your current session</div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setTargetSessionId(session.id);
                          setConfirmOpen(true);
                        }}
                        className="text-sm text-red-400 hover:text-white px-3 py-1 rounded border border-neutral-700"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
  {/* Keep modal declarative and handle confirm externally */}
      <ConfirmModal
        isOpen={confirmOpen}
        loading={revoking}
        title="Sign out session"
        description="Are you sure you want to sign this session out? This will revoke access for that device."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        onClose={() => {
          if (revoking) return;
          setConfirmOpen(false);
          setTargetSessionId(null);
        }}
        onConfirm={async () => {
          if (!targetSessionId) return;
          setRevoking(true);
          try {
            const res = await fetch(`/api/sessions/${targetSessionId}/revoke`, { method: 'POST' });
            if (!res.ok) {
              const json = await res.json().catch(() => null);
              throw new Error(json?.error || 'Failed to revoke session');
            }
            setSessions(prev => prev.filter(s => s.id !== targetSessionId));
            showToast('Session signed out', 'success');
            setConfirmOpen(false);
            setTargetSessionId(null);
          } catch (err) {
            const msg = safeErrorMessage(err);
            console.error('Failed to revoke session:', msg);
            showToast(msg || 'Failed to sign out session', 'error');
          } finally {
            setRevoking(false);
          }
        }}
      />

      {/* Bulk revoke other sessions modal */}
      <ConfirmModal
        isOpen={confirmBulkOpen}
        loading={bulkRevoking}
        title="Sign out other sessions"
        description="This will sign out all other devices and browsers except your current session. Are you sure you want to continue?"
        confirmLabel="Sign out others"
        cancelLabel="Cancel"
        onClose={() => {
          if (bulkRevoking) return;
          setConfirmBulkOpen(false);
        }}
        onConfirm={async () => {
          if (!currentSessionId) return;
          setBulkRevoking(true);
          showToast('Signing out other sessions...', 'info');
          try {
            const others = sortedSessions.filter(s => s.id !== currentSessionId).map(s => s.id);
            if (others.length === 0) {
              showToast('No other sessions to sign out', 'info');
              setConfirmBulkOpen(false);
              setBulkRevoking(false);
              return;
            }

            // Revoke each session using the existing per-session revoke endpoint
            const results: Array<{ id: string; ok: boolean; err?: string }> = await Promise.all(
              others.map(id =>
                fetch(`/api/sessions/${id}/revoke`, { method: 'POST' })
                  .then(r => ({ id, ok: r.ok }))
                  .catch((e: unknown) => ({ id, ok: false, err: safeErrorMessage(e) }))
              )
            );

            const failed = results.filter(r => !r.ok);
            const succeeded = results.filter(r => r.ok).map(r => r.id);

            if (succeeded.length > 0) {
              setSessions(prev => prev.filter(s => !succeeded.includes(s.id)));
            }

            if (failed.length > 0) {
              showToast(`${succeeded.length} session(s) signed out, ${failed.length} failed`, 'error');
            } else {
              showToast(`Signed out ${succeeded.length} other session${succeeded.length !== 1 ? 's' : ''}`, 'success');
            }

            setConfirmBulkOpen(false);
            } catch (err) {
              const msg = safeErrorMessage(err);
              console.error('Bulk revoke failed:', msg);
              showToast(msg || 'Failed to sign out other sessions', 'error');
            } finally {
            setBulkRevoking(false);
          }
        }}
      />
    </div>
  );
}

export default ActiveSessionsList;