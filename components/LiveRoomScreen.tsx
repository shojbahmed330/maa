import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppView, LiveAudioRoom, User, LiveAudioRoomMessage, Author } from '../types';
import { geminiService } from '../services/geminiService';
import Icon from './Icon';
import { AGORA_APP_ID } from '../constants';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const AVAILABLE_REACTIONS = ['❤️', '😂', '👍', '🎉', '🔥', '🙏'];
const EMOJI_LIST = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
  '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
  '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞',
  '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
  '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
  '🙏', '✍️', '💅', '🤳', '💪', '🦾'
];

const EMOJI_REGEX = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
const isJumboEmoji = (text: string | undefined): boolean => {
    if (!text) return false;
    const trimmedText = text.trim();
    const noEmojiText = trimmedText.replace(EMOJI_REGEX, '');
    if (noEmojiText.trim().length > 0) return false; // Contains non-emoji text
    const emojiCount = (trimmedText.match(EMOJI_REGEX) || []).length;
    return emojiCount > 0 && emojiCount <= 2;
};

function stringToIntegerHash(str: string): number {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

interface LiveRoomScreenProps {
  currentUser: User;
  roomId: string;
  onNavigate: (view: AppView, props?: any) => void;
  onGoBack: () => void;
  onSetTtsMessage: (message: string) => void;
}

const Avatar: React.FC<{ user: Author; isHost?: boolean; isSpeaking?: boolean; children?: React.ReactNode }> = ({ user, isHost, isSpeaking, children }) => (
    <div className="relative flex flex-col items-center gap-2 text-center w-24">
        <div className="relative">
            <img 
                src={user.avatarUrl}
                alt={user.name}
                className={`w-20 h-20 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-green-400 ring-4 ring-green-500/50 animate-pulse' : 'border-slate-600'}`}
            />
            {isHost && <div className="absolute -bottom-2 -right-1 text-2xl">👑</div>}
        </div>
        <p className="font-semibold text-slate-200 truncate w-full">{user.name}</p>
        {children}
    </div>
);

const HeartAnimation = () => (
    <div className="heart-animation-container">
        {Array.from({ length: 15 }).map((_, i) => (
            <div
                key={i}
                className="heart"
                style={{
                    left: `${Math.random() * 90 + 5}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    fontSize: `${Math.random() * 1.5 + 1.5}rem`,
                }}
            >
                ❤️
            </div>
        ))}
    </div>
);


const ChatMessage: React.FC<{ 
    message: LiveAudioRoomMessage; 
    activeSpeakerId: string | null; 
    isMe: boolean;
    onReact: (messageId: string, emoji: string) => void;
}> = ({ message, activeSpeakerId, isMe, onReact }) => {
    const isSpeaking = message.sender.id === activeSpeakerId;
    const [isPickerOpen, setPickerOpen] = useState(false);
    const isJumbo = isJumboEmoji(message.text);

    const bubbleClasses = useMemo(() => {
        const base = 'px-4 py-2 rounded-2xl max-w-xs relative transition-all duration-300';
        if (isJumbo) {
            return `bg-transparent`;
        }
        if (isMe) {
            return `${base} bg-gradient-to-br from-blue-600 to-violet-600 text-white ml-auto rounded-br-none`;
        }
        if (message.isHost) {
            return `${base} bg-slate-700 text-slate-100 border border-amber-400/50 rounded-bl-none`;
        }
        return `${base} bg-slate-700 text-slate-100 rounded-bl-none`;
    }, [isMe, message.isHost, isJumbo]);

    const glowClass = isSpeaking ? 'shadow-[0_0_15px_rgba(57,255,20,0.7)]' : '';
    
    const reactionSummary = useMemo(() => {
        if (!message.reactions || Object.keys(message.reactions).length === 0) return null;
        return Object.entries(message.reactions)
            .filter(([, userIds]) => (userIds as string[]).length > 0)
            .map(([emoji, userIds]) => ({ emoji, count: (userIds as string[]).length }))
            .sort((a, b) => b.count - a.count);
    }, [message.reactions]);

    return (
        <div className={`w-full flex animate-fade-in-fast ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start gap-2 group max-w-[85%] ${isMe ? 'flex-row-reverse' : ''}`}>
                 {!isMe && <img src={message.sender.avatarUrl} alt={message.sender.name} className="w-8 h-8 rounded-full mt-1 flex-shrink-0" />}
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && (
                        <div className="flex items-baseline gap-2 px-1">
                            <p className="text-sm font-bold text-slate-300">
                                {message.sender.name}
                                {message.isHost && <span className="ml-1.5" title="Host">👑</span>}
                            </p>
                        </div>
                    )}
                    <div className="relative">
                        <div className={`${bubbleClasses} ${glowClass}`}>
                           <p className={`text-base break-words overflow-wrap-break-word ${isJumbo ? 'jumbo-emoji animate-jumbo' : ''}`}>{message.text}</p>
                        </div>
                        <div className={`absolute top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-900/50 backdrop-blur-sm border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'}`}>
                             <button onClick={() => setPickerOpen(p => !p)} className="text-lg">😀</button>
                        </div>

                        {isPickerOpen && (
                            <div className={`absolute bottom-full mb-1 p-1.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-600 flex items-center gap-1 shadow-lg z-10 ${isMe ? 'right-0' : 'left-0'}`}>
                                {AVAILABLE_REACTIONS.map(emoji => (
                                    <button key={emoji} type="button" onClick={() => { onReact(message.id, emoji); setPickerOpen(false); }} className="text-2xl p-1 rounded-full hover:bg-slate-700/50 transition-transform hover:scale-125">
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {reactionSummary && !isJumbo && (
                        <div className={`flex gap-1.5 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {reactionSummary.map(({ emoji, count }) => (
                                <div key={emoji} className="bg-slate-700/60 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
                                    <span>{emoji}</span>
                                    <span className="text-slate-300 font-semibold">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


const LiveRoomScreen: React.FC<LiveRoomScreenProps> = ({ currentUser, roomId, onNavigate, onGoBack, onSetTtsMessage }) => {
    const [room, setRoom] = useState<LiveAudioRoom | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

    const agoraClient = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    
    const [messages, setMessages] = useState<LiveAudioRoomMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    const [isEmojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [showHeartAnimation, setShowHeartAnimation] = useState(false);

    const [isAudioEnabled, setIsAudioEnabled] = useState(false);
    const isAudioEnabledRef = useRef(isAudioEnabled);
    isAudioEnabledRef.current = isAudioEnabled;

    const onGoBackRef = useRef(onGoBack);
    onGoBackRef.current = onGoBack;
    const onSetTtsMessageRef = useRef(onSetTtsMessage);
    onSetTtsMessageRef.current = onSetTtsMessage;

    const handleHangUp = useCallback(async () => {
        const isHost = room ? room.host.id === currentUser.id : false;
        const action = isHost ? geminiService.endLiveAudioRoom : geminiService.leaveLiveAudioRoom;
        
        try {
            if (localAudioTrack.current) {
                localAudioTrack.current.stop();
                localAudioTrack.current.close();
            }
            if (agoraClient.current) {
                await agoraClient.current.leave();
            }
            await action(currentUser.id, roomId).catch(e => console.log('Action failed on hangup, likely expected:', e));
        } catch (error) {
            console.error("Error during hang up:", error);
        } finally {
            onGoBackRef.current();
        }
    }, [room, currentUser.id, roomId]);

    useEffect(() => {
        let isMounted = true;
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        agoraClient.current = client;

        const uid = stringToIntegerHash(currentUser.id);

        const setupAgora = async () => {
            client.on('user-published', async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                if (mediaType === 'audio') {
                    if (isAudioEnabledRef.current) {
                        user.audioTrack?.play();
                    }
                }
            });
            client.on('user-left', (user) => {
                if (isMounted) {
                    setActiveSpeakerId(prev => prev === String(user.uid) ? null : prev);
                }
            });
            client.on('volume-indicator', volumes => {
                if (!isMounted) return;
                const mainSpeaker = volumes.reduce((max, current) => (current.level > max.level ? current : max), volumes[0]);
                if (mainSpeaker && mainSpeaker.level > 10) {
                    setActiveSpeakerId(String(mainSpeaker.uid));
                } else {
                    setActiveSpeakerId(null);
                }
            });
            client.enableAudioVolumeIndicator();

            const token = await geminiService.getAgoraToken(roomId, uid);
            if (!token) {
                onSetTtsMessageRef.current("Failed to join room: Could not get authentication token.");
                handleHangUp();
                return;
            }

            await client.join(AGORA_APP_ID, roomId, token, uid);

            try {
                localAudioTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
                await client.publish(localAudioTrack.current);
            } catch (err) {
                console.warn("Could not get mic, joining as listener.", err);
                onSetTtsMessageRef.current("Microphone not found or permission denied. You've joined as a listener.");
                setIsMuted(true);
            }
        };

        geminiService.joinLiveAudioRoom(currentUser.id, roomId)
            .then(() => {
                if (isMounted) setupAgora();
            })
            .catch(error => {
                console.error("Failed to join or setup Agora:", error);
                handleHangUp();
            });

        return () => {
            isMounted = false;
            handleHangUp();
        };
    }, [roomId, currentUser.id, handleHangUp]);

    useEffect(() => {
        const unsubscribe = geminiService.listenToAudioRoom(roomId, (liveRoom) => {
            if (liveRoom) {
                setRoom(liveRoom);
                setIsLoading(false);
            } else {
                onGoBack();
            }
        });
        const unsubscribeMessages = geminiService.listenToLiveAudioRoomMessages(roomId, setMessages);

        return () => {
            unsubscribe();
            unsubscribeMessages();
        };
    }, [roomId, onGoBack]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedMessage = newMessage.trim();
        if (!trimmedMessage || !room) return;

        const isHost = room.host.id === currentUser.id;
        const isSpeaker = room.speakers.some(s => s.id === currentUser.id);

        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, trimmedMessage, isHost, isSpeaker);
        setNewMessage('');
    };
    
    const handleReactToMessage = (messageId: string, emoji: string) => {
        geminiService.reactToLiveAudioRoomMessage(roomId, messageId, currentUser.id, emoji);
    };

    const handleSendEmoji = async (emoji: string) => {
         if (!room) return;
        const isHost = room.host.id === currentUser.id;
        const isSpeaker = room.speakers.some(s => s.id === currentUser.id);

        await geminiService.sendLiveAudioRoomMessage(roomId, currentUser, emoji, isHost, isSpeaker);
    };

    const handleToggleMute = () => {
        if (localAudioTrack.current) {
            const muted = !isMuted;
            localAudioTrack.current.setMuted(muted);
            setIsMuted(muted);
        }
    };
    
    const handleHeartClick = () => {
        setShowHeartAnimation(true);
        setTimeout(() => setShowHeartAnimation(false), 2500);
        handleSendEmoji('❤️');
    };

    const handleEnableAudio = async () => {
        try {
            await AgoraRTC.getAudioContext().resume();
            console.log('AudioContext resumed successfully on user gesture.');
        } catch (e) {
            console.error('Could not resume AudioContext:', e);
        }

        const client = agoraClient.current;
        if (!client) return;

        try {
            await Promise.all(client.remoteUsers.map(user => {
                if (user.hasAudio && !user.audioTrack?.isPlaying) {
                    return user.audioTrack?.play();
                }
                return Promise.resolve();
            }));
            
            console.log("Remote tracks played successfully on user gesture.");
            setIsAudioEnabled(true);
        } catch (e) {
            console.error("Error playing remote audio tracks on user gesture:", e);
            alert("Could not enable audio. Your browser might be blocking it. Please try refreshing the page.");
        }
    };

    if (isLoading || !room) {
        return <div className="h-full w-full flex items-center justify-center bg-black text-white">Joining room...</div>;
    }

    const isHost = room.host.id === currentUser.id;
    const isSpeaker = room.speakers.some(s => s.id === currentUser.id);
    const isListener = !isSpeaker;

    return (
        <div className="h-full w-full flex flex-col md:flex-row bg-gradient-to-br from-slate-900 via-indigo-900 to-black text-white overflow-hidden">
            {!isAudioEnabled && (
                <div className="absolute inset-0 bg-black/80 z-40 flex flex-col items-center justify-center gap-4 p-4 text-center">
                    <h2 className="text-2xl font-bold">Audio is Disabled</h2>
                    <p className="text-slate-300 max-w-sm">To hear others, you need to enable audio playback in your browser. This is required due to browser auto-play policies.</p>
                    <button
                        onClick={handleEnableAudio}
                        className="bg-lime-600 hover:bg-lime-500 text-black font-bold py-3 px-6 rounded-lg text-lg"
                    >
                        Enable Audio
                    </button>
                </div>
            )}
            <main className="flex-grow p-6 flex flex-col">
                <header className="flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">{room.topic}</h1>
                        <p className="text-slate-400">with {room.host.name}</p>
                    </div>
                    <button onClick={handleHangUp} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-5 rounded-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" transform="rotate(-135 12 12)"/></svg>
                        <span>Leave</span>
                    </button>
                </header>

                <div className="flex-grow my-6 overflow-y-auto no-scrollbar">
                    <h2 className="text-lg font-bold text-slate-300 mb-4">Speakers</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {room.speakers.map(speaker => {
                             const speakerAgoraUid = stringToIntegerHash(speaker.id);
                             return (
                                 <Avatar
                                     key={speaker.id}
                                     user={speaker}
                                     isHost={speaker.id === room.host.id}
                                     isSpeaking={activeSpeakerId === String(speakerAgoraUid)}
                                 />
                             );
                        })}
                    </div>
                    <h2 className="text-lg font-bold text-slate-300 mt-8 mb-4">Listeners ({room.listeners.length})</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {room.listeners.map(listener => <Avatar key={listener.id} user={listener} />)}
                    </div>
                </div>

                <footer className="flex-shrink-0 flex items-center justify-center gap-4">
                     {isSpeaker && (
                        <button onClick={handleToggleMute} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-rose-600' : 'bg-slate-700'}`}>
                            <Icon name={isMuted ? 'microphone-slash' : 'mic'} className="w-6 h-6" />
                        </button>
                    )}
                </footer>
            </main>
            <aside className="w-full md:w-80 lg:w-96 flex-shrink-0 bg-black/40 backdrop-blur-sm border-t md:border-t-0 md:border-l border-white/10 flex flex-col">
                 <div className="flex-grow p-3 overflow-y-auto space-y-3 no-scrollbar relative">
                    {showHeartAnimation && <HeartAnimation />}
                    {messages.map(msg => <ChatMessage key={msg.id} message={msg} isMe={msg.sender.id === currentUser.id} activeSpeakerId={activeSpeakerId} onReact={handleReactToMessage}/>)}
                    <div ref={messagesEndRef} />
                 </div>
                 <div className="relative p-2 border-t border-slate-700 bg-black/30">
                     <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                         <button type="button" onClick={() => setEmojiPickerOpen(p => !p)} className="p-2 rounded-full hover:bg-slate-700/50 text-slate-300">
                             <Icon name="face-smile" className="w-6 h-6"/>
                         </button>
                         <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Send a message..."
                            className="w-full bg-slate-700/80 border border-slate-600 rounded-full py-2 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                         />
                         <button type="button" onClick={handleHeartClick} className="p-2 rounded-full hover:bg-slate-700/50 text-2xl">❤️</button>
                     </form>
                     {isEmojiPickerOpen && (
                        <div className="absolute bottom-full mb-2 left-2 right-2 h-48 overflow-y-auto p-2 bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded-lg no-scrollbar">
                           <div className="grid grid-cols-8 gap-1">
                                {EMOJI_LIST.map(emoji => (
                                    <button key={emoji} onClick={() => { handleSendEmoji(emoji); setEmojiPickerOpen(false);}} className="text-2xl p-1 aspect-square rounded-md hover:bg-slate-700/50">{emoji}</button>
                                ))}
                           </div>
                        </div>
                     )}
                 </div>
            </aside>
        </div>
    );
};

export default LiveRoomScreen;
