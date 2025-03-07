import {
  ChangeEventHandler,
  FC,
  KeyboardEventHandler,
  MouseEventHandler,
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageList } from "./Messages";
import {
  selectActivePaneId,
  selectPanes,
  useMessages,
} from "../../state/selectors";
import { useAppDispatch, useAppSelector } from "../../state/store";
import { openConversation, sendMessage } from "../../state/conversations";
import { Pane, paneSlice } from "../../state/panes";
import { Uuid } from "../../utils/uuid";
import { useLiveQuery } from "dexie-react-hooks";
import clsx from "clsx";
import {
  dbSelectConversation,
  dbSelectChatConfigs,
} from "../../db/db-selectors";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Conversation, db } from "../../db";

interface PaneProps {
  pane: Pane;
  paneId: Uuid;
}
const Pane: FC<PaneProps> = ({ pane, paneId }) => {
  const dispatch = useAppDispatch();
  const activePaneId = useAppSelector(selectActivePaneId);
  const isActivePane = activePaneId === paneId;

  const conversation = useLiveQuery(
    () => dbSelectConversation(pane.conversationId),
    [pane.conversationId]
  );
  const messages = useMessages(pane.conversationId);

  const [messageDraft, setMessageDraft] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useFocusInputOnActive({
    ref: textAreaRef,
    isActive: isActivePane,
    conversationId: conversation?.id,
  });

  useLayoutEffect(() => {
    const textArea = textAreaRef.current;
    if (textArea == null) {
      return;
    }

    const maxSize = window.innerHeight / 2.5;
    const minHeight = 55; // Minimum height of textarea
    const lineHeight = parseInt(window.getComputedStyle(textArea).lineHeight) || 20;
    
    // Reset height to auto to get proper scrollHeight
    textArea.style.height = "auto";
    
    // Calculate content height
    const contentHeight = Math.max(minHeight, textArea.scrollHeight);
    const isMaxSize = contentHeight > maxSize;

    if (isMaxSize) {
      textArea.style.height = `${maxSize}px`;
      textArea.style.overflowY = "auto";
      // Add a subtle transition only when expanding to max size
      textArea.style.transition = "height 0.1s ease-out";
    } else {
      // Round to nearest line height to prevent partial line display
      const roundedHeight = Math.ceil(contentHeight / lineHeight) * lineHeight;
      textArea.style.height = `${roundedHeight}px`;
      textArea.style.overflowY = "hidden";
      textArea.style.transition = "none"; // No transition when auto-expanding
    }

    // Ensure cursor remains visible when expanding
    if (document.activeElement === textArea) {
      textArea.scrollTop = textArea.scrollHeight;
    }
  }, [messageDraft]);

  const onKeydown: KeyboardEventHandler<HTMLTextAreaElement> = async (e) => {
    // Check if the message starts with a command
    if (
      e.key === "Enter" &&
      messageDraft !== "" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      
      // Handle commands
      if (messageDraft.startsWith('/')) {
        const parts = messageDraft.split(' ');
        const command = parts[0].toLowerCase();
        const content = parts.slice(1).join(' ');
        
        if (command === '/newpane' && content.trim() !== '') {
          setMessageDraft("");
          
          // Create a new conversation and open it in a new pane
          const conversationId = await db.addConversation(conversation?.presetId);
          
          // Open the conversation in a new pane
          dispatch(openConversation(conversationId.valueOf() as number, { openInNewPane: true }));
          
          // Wait a bit for the new pane to be created
          setTimeout(() => {
            dispatch(sendMessage(conversationId.valueOf() as number, content));
          }, 100);
          
          return;
        }
      }
      
      // Normal message handling
      setMessageDraft("");
      await dispatch(sendMessage(pane.conversationId, messageDraft));
    }
  };

  const onInput: ChangeEventHandler<HTMLTextAreaElement> = async (e) => {
    setMessageDraft(e.target.value);
  };

  const onRemovePane: MouseEventHandler = (e) => {
    e.stopPropagation();
    dispatch(paneSlice.actions.deletePane({ paneId: paneId }));
  };

  const onClickPane = () => {
    dispatch(paneSlice.actions.setActivePane(paneId));
  };

  return (
    <div
      className={clsx(
        // TODO(gab): make panes a table for border collapse. negative left margin collapses borders
        "flex min-w-[400px] flex-1 border-[8px] border-l-0 border-dark-gray bg-dark-gray",
        !isActivePane && "cursor-pointer"
      )}
      onClick={onClickPane}
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded bg-white">
        <div
          className={clsx(
            "flex h-[70px] cursor-pointer items-center border-b px-4",
            isActivePane ? "border-gray-300 bg-gray-100" : "border-transparent"
          )}
        >
          <div className="min-w-0 flex-1">
            <div className={clsx("flex-1 truncate text-title")}>
              {conversation?.title == null || conversation.title === ""
                ? "New conversation"
                : conversation.title}
            </div>
            {conversation ? (
              <ChatConfigDropdown conversation={conversation} />
            ) : null}
          </div>

          <div
            className={clsx(
              "flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-gray-100 active:bg-gray-200",
              isActivePane && "hover:bg-gray-200 active:bg-gray-300"
            )}
            onClickCapture={onRemovePane}
          >
            <span className="material-symbols-outlined material-fat pt-[2px]">
              close
            </span>
          </div>
        </div>
        {/* TODO: remove memo by fixing dexies weird memoization & move input to own component */}
        {useMemo(
          () => (
            <MessageList messages={messages} isActivePane={isActivePane} />
          ),
          [isActivePane, messages]
        )}
        <div className="flex items-center justify-center p-4">
          <textarea
            ref={textAreaRef}
            rows={1}
            value={messageDraft}
            autoFocus
            onChange={onInput}
            onKeyDown={onKeydown}
            placeholder="Message or /newpane to create a new pane..."
            className="w-full max-w-[700px] resize-none overflow-hidden rounded-lg border
              border-gray-300 p-3 text-base leading-6 placeholder:text-gray-500
              focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
              hover:border-gray-400 transition-colors duration-200
              shadow-[0_0_10px_rgba(0,0,0,0.10)]
              scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent"
          />
        </div>
      </div>
    </div>
  );
};

const useFocusInputOnActive = ({
  ref,
  isActive,
  conversationId,
}: {
  isActive: boolean;
  ref: MutableRefObject<HTMLTextAreaElement | null>;
  conversationId?: number;
}) => {
  useEffect(() => {
    if (isActive && conversationId && ref.current != null) {
      ref.current.focus();
    }
  }, [conversationId, isActive, ref]);
};

const StartPage: FC = () => (
  <div
    className={clsx(
      "flex min-w-[400px] flex-1 border-[8px] border-l-0 border-dark-gray bg-dark-gray"
    )}
  >
    <div className="flex flex-1 flex-col items-center rounded bg-white p-40 px-10">
      <div className="text-header">Welcome to Chat LLM</div>
      <div className="mb-6 text-center">
        All your data is 100% local, and ChatGPT calls are made from the browser
      </div>
      <div>This is an open sourced project, contributions welcome</div>
      <a
        href="https://github.com/gabrielpetersson/chat-llm"
        className="mb-6 text-blue-600 underline"
      >
        https://github.com/gabrielpetersson/chat-llm
      </a>
      <div className="text-center">Click here to find your api key</div>
      <a
        href="https://platform.openai.com/account/api-keys"
        target="_blank"
        className="mb-6 text-blue-600 underline"
      >
        https://platform.openai.com/account/api-keys
      </a>
      <div className="text-center">
        Press "Default chat" to get started, or create a chat config!
      </div>
    </div>
  </div>
);

export const Panes: FC = () => {
  const panes = useAppSelector(selectPanes);
  const paneEntries = Object.entries(panes);
  if (paneEntries.length === 0) {
    return <StartPage />;
  }
  return (
    <div className="flex flex-1 overflow-x-auto">
      {paneEntries.map(([paneId, pane]) => {
        return <Pane key={paneId} paneId={paneId as Uuid} pane={pane} />;
      })}
    </div>
  );
};

interface ChatConfigDropdownProps {
  conversation: Conversation;
}
const ChatConfigDropdown: FC<ChatConfigDropdownProps> = ({ conversation }) => {
  const chatConfigs = useLiveQuery(() => dbSelectChatConfigs(), []);
  const currentChatConfig = chatConfigs?.find(
    (p) => p.id === conversation.presetId
  );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild tabIndex={-1}>
        <button className="mt-[-8px] flex items-center text-[11px] font-thin text-gray-500 outline-none">
          {`Chat config: ${currentChatConfig?.title ?? "Default"}`}
          <span className="material-symbols-outlined pt-1 text-[16px]">
            expand_more
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[150px] max-w-[300px] bg-white shadow-[0px_0px_3px_rgba(0,0,0,0.3)]"
          sideOffset={5}
        >
          <DropdownMenu.Item className="w-full truncate border-b border-gray-300 bg-gray-100 p-2 text-[11px] outline-none">
            {"Select chat config"}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onClick={() => {
              db.setConversationChatConfigId(conversation.id, "default");
            }}
            className="w-full cursor-pointer truncate p-2 text-[11px] outline-none hover:bg-gray-100"
          >
            {"Default chat"}
          </DropdownMenu.Item>
          {chatConfigs?.map((chatConfig) => {
            return (
              <DropdownMenu.Item
                key={chatConfig.id}
                className="w-full cursor-pointer truncate p-2 text-[11px] outline-none hover:bg-gray-100"
                onClick={() => {
                  db.setConversationChatConfigId(
                    conversation.id,
                    chatConfig.id
                  );
                }}
              >
                {chatConfig.title}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
