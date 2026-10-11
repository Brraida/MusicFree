import React from "react";
import renderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
jest.mock("@/utils/rpx", () => ({ __esModule: true, default: (n: number) => n, vmax: (n: number) => n }));
jest.mock("@/hooks/useColors", () => ({ __esModule: true, default: () => ({ placeholder: "#eee" }) }));
jest.mock("@/components/base/themeText", () => ({ __esModule: true, default: require("react-native").Text }));
jest.mock("@/components/base/input", () => ({ __esModule: true, default: require("react-native").TextInput }));
jest.mock("@/components/base/listItem", () => ({ __esModule: true, default: require("react-native").View }));
jest.mock("react-native-gesture-handler", () => ({ ScrollView: require("react-native").View }));
jest.mock("@/constants/globalStyle", () => ({ __esModule: true, default: { flex1: { flex: 1 } } }));
jest.mock("@/components/panels/base/panelBase", () => ({ __esModule: true, default: (p: any) => p.renderBody(false) }));
jest.mock("@/components/panels/base/panelHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/panels/usePanel", () => ({ hidePanel: jest.fn() }));
jest.mock("@/core/i18n", () => ({ useI18N: () => ({ t: (key: string) => key }) }));
import Panel from "@/components/panels/types/setUserVariables";
import Header from "@/components/panels/base/panelHeader";
import Base from "@/components/panels/base/panelBase";
import Input from "@/components/base/input";
import { hidePanel } from "@/components/panels/usePanel";
const initValues = { username: "old", password: "old-test-only" };
const variables = [{ key: "username" }, { key: "password" }];
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}
let tree: renderer.ReactTestRenderer;
let save: ReturnType<typeof jest.fn<(v: Record<string, string>, close: () => void) => void>>;
function mount(validate?: (values: Record<string, string>) => Promise<void>) {
    act(() => { tree = renderer.create(<Panel variables={variables} initValues={initValues} onValidate={validate} onOk={save} />); });
    return () => tree.root.findByType(Header).props;
}
beforeEach(() => { jest.clearAllMocks(); save = jest.fn(); });
describe("plugin configuration validates drafts before persisting", () => {
    it("persists only the edited draft after validation succeeds", async () => {
        const check = deferred();
        const validate = jest.fn(() => check.promise);
        const header = mount(validate);
        act(() => { tree.root.findAllByType(Input)[0].props.onChangeText("new"); });
        let pending!: Promise<void>;
        act(() => { pending = header().onOk(); });
        expect(validate).toHaveBeenCalledWith({ username: "new", password: "old-test-only" });
        expect(save).not.toHaveBeenCalled();
        expect(initValues.username).toBe("old");
        expect(header().okText).toBe("configValidation.checking");
        expect(tree.root.findAllByType(Input)[0].props.editable).toBe(false);
        await act(async () => { check.resolve(); await pending; });
        expect(save).toHaveBeenCalledWith({ username: "new", password: "old-test-only" }, hidePanel);
    });
    it("keeps the form open on wrong credentials and allows correction and retry", async () => {
        const validate = jest.fn<() => Promise<void>>().mockRejectedValueOnce(Object.assign(new Error("private backend details"), { code: "MF_PLUGIN_AUTH_FAILED" })).mockResolvedValueOnce(undefined);
        const header = mount(validate);
        await act(async () => { await header().onOk(); });
        expect(save).not.toHaveBeenCalled();
        expect(hidePanel).not.toHaveBeenCalled();
        expect(JSON.stringify(tree.toJSON())).toContain("configValidation.authentication");
        expect(JSON.stringify(tree.toJSON())).not.toContain("private backend details");
        act(() => { tree.root.findAllByType(Input)[1].props.onChangeText("corrected-test-only"); });
        await act(async () => { await header().onOk(); });
        expect(save).toHaveBeenCalledWith({ username: "old", password: "corrected-test-only" }, hidePanel);
    });
    it.each(["cancel", "dismiss", "unmount"])("does not persist a late success after %s", async mode => {
        const check = deferred();
        const header = mount(() => check.promise);
        let pending!: Promise<void>;
        act(() => { pending = header().onOk(); });
        act(() => {
            if (mode === "cancel") header().onCancel();
            else if (mode === "dismiss") tree.root.findByType(Base).props.onDismiss();
            else tree.unmount();
        });
        await act(async () => { check.resolve(); await pending; });
        expect(save).not.toHaveBeenCalled();
        if (mode === "cancel") expect(hidePanel).toHaveBeenCalled();
    });
    it("ignores duplicate save taps while verification is pending", async () => {
        const check = deferred();
        const validate = jest.fn(() => check.promise);
        const header = mount(validate);
        let pending!: Promise<void>;
        act(() => { pending = header().onOk(); header().onOk(); });
        expect(validate).toHaveBeenCalledTimes(1);
        await act(async () => { check.resolve(); await pending; });
        expect(save).toHaveBeenCalledTimes(1);
    });
    it("keeps ordinary variable forms compatible without a validation hook", async () => {
        const header = mount();
        await act(async () => { await header().onOk(); });
        expect(save).toHaveBeenCalledWith(initValues, hidePanel);
        expect(JSON.stringify(tree.toJSON())).not.toContain("configValidation.hint");
    });
});
