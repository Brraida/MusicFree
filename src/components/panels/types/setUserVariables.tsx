import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, StyleSheet } from "react-native";
import rpx, { vmax } from "@/utils/rpx";
import useColors from "@/hooks/useColors";

import ThemeText from "@/components/base/themeText";
import { ScrollView } from "react-native-gesture-handler";
import PanelBase from "../base/panelBase";
import { hidePanel } from "../usePanel";
import ListItem from "@/components/base/listItem";
import Input from "@/components/base/input";
import globalStyle from "@/constants/globalStyle";
import PanelHeader from "../base/panelHeader";
import { useI18N } from "@/core/i18n";
import { getPluginPlaybackErrorKind } from "@/utils/pluginPlaybackError";

interface IUserVariablesProps {
    title?: string;
    onOk: (values: Record<string, string>, closePanel: () => void) => void | Promise<void>;
    onValidate?: (values: Record<string, string>) => Promise<void>;
    variables: IPlugin.IUserVariable[];
    initValues?: Record<string, string>;
    onCancel?: () => void;
}

export default function SetUserVariables(props: IUserVariablesProps) {
    const { onOk, onCancel, onValidate, variables, initValues = {}, title } = props;

    const colors = useColors();

    const { t } = useI18N();
    const resultRef = useRef({ ...initValues });
    const attemptRef = useRef(0);
    const inFlightRef = useRef(false);
    const [saving, setSaving] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const invalidateAttempt = () => { ++attemptRef.current; };
    useEffect(() => invalidateAttempt, []);

    const save = async () => {
        if (inFlightRef.current) {
            return;
        }
        const attempt = ++attemptRef.current;
        inFlightRef.current = true;
        setSaving(true);
        setValidationError(null);
        const values = { ...resultRef.current };
        try {
            await onValidate?.(values);
            // Cancel, back, outside tap and unmount all invalidate a pending check.
            if (attempt !== attemptRef.current) {
                return;
            }
            await onOk(values, hidePanel);
        } catch (error) {
            if (attempt === attemptRef.current) {
                const kind = getPluginPlaybackErrorKind(error);
                setValidationError(t(`configValidation.${kind ?? "failed"}`));
            }
        } finally {
            if (attempt === attemptRef.current) {
                inFlightRef.current = false;
                setSaving(false);
            }
        }
    };

    return (
        <PanelBase
            onDismiss={invalidateAttempt}
            height={vmax(80)}
            positionMethod='top'
            keyboardAvoidBehavior='none'
            renderBody={() => (
                <>
                    <PanelHeader
                        title={title ?? "设置用户变量"}
                        okText={saving ? t("configValidation.checking") : onValidate ? t("common.save") : undefined}
                        onCancel={() => {
                            invalidateAttempt();
                            onCancel?.();
                            hidePanel();
                        }}
                        onOk={save}
                    />
                    <KeyboardAvoidingView
                        behavior="padding"
                        style={globalStyle.flex1}>
                        <ScrollView
                            contentContainerStyle={{
                                paddingBottom: vmax(20),
                            }}>
                            {onValidate ? <ThemeText style={styles.validationMessage}>
                                {t("configValidation.hint")}
                            </ThemeText> : null}
                            {validationError ? <ThemeText accessibilityRole="alert" style={styles.validationMessage} fontColor="primary">
                                {validationError}
                            </ThemeText> : null}
                            {variables.map(it => (
                                <ListItem
                                    key={it.key}
                                    withHorizontalPadding
                                    style={styles.listItem}>
                                    <ThemeText
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        style={styles.varName}>
                                        {it.name ?? it.key}
                                    </ThemeText>
                                    <Input
                                        defaultValue={initValues[it.key]}
                                        editable={!saving}
                                        onChangeText={e => {
                                            resultRef.current[it.key] = e;
                                            setValidationError(null);
                                        }}
                                        style={[
                                            styles.input,
                                            {
                                                backgroundColor:
                                                    colors.placeholder,
                                            },
                                        ]}
                                        placeholder={it.hint}
                                    />
                                </ListItem>
                            ))}
                        </ScrollView>
                    </KeyboardAvoidingView>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    validationMessage: {
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(12),
    },
    wrapper: {
        width: rpx(750),
    },
    opeartions: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        flexDirection: "row",
        height: rpx(100),
        alignItems: "center",
        justifyContent: "space-between",
    },
    listItem: {
        justifyContent: "space-between",
    },
    varName: {
        maxWidth: "35%",
    },
    input: {
        width: "50%",
        paddingVertical: rpx(8),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(8),
    },
});
