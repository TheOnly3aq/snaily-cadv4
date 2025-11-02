import * as React from "react";
import {
  Button,
  TextField,
  Loader,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@snailycad/ui";
import { Form, Formik, type FormikHelpers } from "formik";
import { useTranslations } from "use-intl";
import { useQuery } from "@tanstack/react-query";
import useFetch from "lib/useFetch";
import { useGenerateCallsign } from "hooks/useGenerateCallsign";
import {
  formatUnitDivisions,
  getDepartmentAbbreviation,
  getUnitDepartment,
  makeUnitName,
} from "lib/utils";
import { SocketEvents } from "@snailycad/config";
import { useListener } from "@casperiv/use-socket.io";
import { ChevronDown, ChatSquare, Trash } from "react-bootstrap-icons";
import { cn } from "mxcn";
import { useLeoState } from "state/leo-state";
import { ShouldDoType } from "@snailycad/types";
import { isUnitOfficer } from "@snailycad/utils/typeguards";

interface OfficerChatMessage {
  id: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  message: string;
  creator: {
    unit: any;
  };
}

const INITIAL_VALUES = {
  message: "",
};

export function GDOfficerChatbox() {
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [messages, setMessages] = React.useState<OfficerChatMessage[]>([]);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const { execute, state } = useFetch();
  const { generateCallsign } = useGenerateCallsign();
  const t = useTranslations("Leo");
  const activeOfficer = useLeoState((state) => state.activeOfficer);

  const isOfficerOnDuty =
    activeOfficer !== null &&
    activeOfficer.status !== null &&
    activeOfficer.status.shouldDo !== ShouldDoType.SET_OFF_DUTY;

  const { isLoading } = useQuery({
    queryKey: ["officer-chat"],
    queryFn: async () => {
      const { json } = await execute<OfficerChatMessage[]>({
        path: "/leo/officer-chat",
        method: "GET",
      });

      const array = Array.isArray(json) ? json : [];
      setMessages(array);

      return array;
    },
    enabled: isOfficerOnDuty,
  });

  useListener(
    SocketEvents.OfficerChat,
    (data: OfficerChatMessage) => {
      if (!isOfficerOnDuty) return;
      setMessages((prev) => {
        if (prev.some((v) => v.id === data.id)) return prev;
        return [...prev, data];
      });
    },
    [isOfficerOnDuty],
  );

  useListener(
    SocketEvents.OfficerChatDeleted,
    (messageId: string) => {
      if (!isOfficerOnDuty) return;
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    },
    [isOfficerOnDuty],
  );

  React.useEffect(() => {
    if (!isOfficerOnDuty) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOfficerOnDuty]);

  if (!isOfficerOnDuty) {
    return null;
  }

  async function onSubmit(
    values: typeof INITIAL_VALUES,
    helpers: FormikHelpers<typeof INITIAL_VALUES>,
  ) {
    const { json } = await execute<OfficerChatMessage, typeof INITIAL_VALUES>({
      path: "/leo/officer-chat",
      method: "POST",
      data: values,
      helpers,
    });

    if (json.id) {
      helpers.resetForm();
    }
  }

  function handleCtrlEnter(event: React.KeyboardEvent<HTMLTextAreaElement>, submitForm: any) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      submitForm();
    }
  }

  async function handleDeleteMessage(messageId: string) {
    const { json } = await execute({
      path: `/leo/officer-chat/${messageId}`,
      method: "DELETE",
    });

    if (json) {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    }
  }

  function isOwnMessage(message: OfficerChatMessage): boolean {
    if (!activeOfficer || !message.creator.unit) return false;

    const messageUnitId = message.creator.unit.id;
    const currentUnitId = activeOfficer.id;

    return messageUnitId === currentUnitId;
  }

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(true)}
        className="fixed bottom-4 right-4 z-50 bg-blue-900 hover:bg-blue-800 text-white rounded-full p-4 shadow-lg transition-colors"
        aria-label="Open officer chat"
      >
        <ChatSquare className="w-6 h-6" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
            {messages.length > 9 ? "9+" : messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-white dark:bg-tertiary border border-secondary rounded-lg shadow-xl",
        "w-[400px] max-w-[calc(100vw-2rem)] flex flex-col",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-secondary">
        <h3 className="font-semibold text-lg text-gray-500 dark:text-white">Officer Chat</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-secondary text-gray-500 dark:text-white rounded transition-colors"
            aria-label="Minimize chat"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] min-h-[300px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : messages.length <= 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center mt-4">{t("noMessages")}</p>
        ) : (
          messages.map((message) => {
            const unit = message.creator.unit;
            if (!unit) return null;

            const isCombinedUnit = "officers" in unit && Array.isArray(unit.officers);
            const templateId = isCombinedUnit ? "pairedUnitTemplate" : "callsignTemplate";
            const callsign = generateCallsign(unit, templateId);
            const unitName = makeUnitName(unit);
            const departmentObj = getUnitDepartment(unit);
            const departmentName = departmentObj?.value.value ?? "";
            const departmentCallsign = getDepartmentAbbreviation(departmentName);
            const divisions = isUnitOfficer(unit) ? formatUnitDivisions(unit) : null;
            const rank = isUnitOfficer(unit) ? unit.rank?.value : null;
            const status = unit.status?.value.value ?? null;
            const isOwn = isOwnMessage(message);

            return (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg p-2 break-words relative group",
                  isOwn ? "bg-blue-900 dark:bg-blue-900" : "bg-gray-100 dark:bg-secondary",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!isOwn ? (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <span className="font-semibold text-sm text-gray-500 dark:text-white cursor-help">
                          {callsign} {unitName} ({departmentCallsign})
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent pointerEvents className="max-w-[300px]">
                        <div className="space-y-1 text-sm">
                          {departmentCallsign && (
                            <div>
                              <span className="font-semibold">{t("department")}:</span>{" "}
                              <span>{departmentCallsign}</span>
                              {departmentName !== departmentCallsign && (
                                <span className="text-gray-500 dark:text-gray-400 ml-1">
                                  ({departmentName})
                                </span>
                              )}
                            </div>
                          )}
                          {!departmentCallsign && departmentName && (
                            <div>
                              <span className="font-semibold">{t("department")}:</span>{" "}
                              <span>{departmentName}</span>
                            </div>
                          )}
                          {divisions && (
                            <div>
                              <span className="font-semibold">{t("division")}:</span>{" "}
                              <span>{divisions}</span>
                            </div>
                          )}
                          {rank && (
                            <div>
                              <span className="font-semibold">{t("rank")}:</span>{" "}
                              <span>{rank}</span>
                            </div>
                          )}
                          {status && (
                            <div>
                              <span className="font-semibold">{t("status")}:</span>{" "}
                              <span>{status}</span>
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span className="font-semibold text-sm text-gray-500 dark:text-white">
                      {callsign} {unitName} ({departmentCallsign})
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </span>
                  {isOwn && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(message.id)}
                      className="ml-auto p-1 hover:bg-red-500 dark:hover:bg-red-600 text-gray-500 dark:text-gray-400 hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Delete message"
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-white">{message.message}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="border-t border-secondary p-3">
        <Formik onSubmit={onSubmit} initialValues={INITIAL_VALUES}>
          {({ values, setFieldValue, submitForm }) => (
            <Form>
              <TextField
                value={values.message}
                onChange={(value) => setFieldValue("message", value)}
                placeholder={t("message")}
                isTextarea
                onKeyDown={(e) => handleCtrlEnter(e, submitForm)}
                className="mb-2"
                label=""
              />
              <Button
                disabled={state === "loading" || !values.message.trim()}
                className="w-full flex items-center justify-center"
                type="submit"
              >
                {state === "loading" ? <Loader className="mr-2 border-red-200" /> : null}
                {t("send")}
              </Button>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
}
