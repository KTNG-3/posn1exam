import path from "node:path";

import fs from "fs-extra";
import AdmZip from "adm-zip";
import puppeteer, { Browser, ElementHandle, InnerParams, NodeFor, Page } from "puppeteer";
import dotenv from "dotenv";

/**
 * Kawin Kaewnern
 * https://github.com/KTNG-3/posn1exam
 */

function covertToDisplayName(str: string): string {
    //write by good old friend, ChatGPT5
    //create a nodejs function to transform string
    // "28substrCompare" -> "28 Substr Compare"
    // "substrCompareYaya" -> "Substr Compare Yaya"
    // "substrCompareYAYA" -> "Substr Compare YAYA"
    // "substrSUPERpls" -> "Substr SUPER Pls"
    // "substrSUPERPls" -> "Substr SUPERP Ls"
    // "substr3Compare2YAYA1" -> "Substr 3 Compare 2 YAYA 1"
    // "Damit_Haha-1" -> "Damit Haha 1"
    // "2Da_m3it-Ha-ha_1" -> "2 Da M 3 It Ha Ha 1"

    function splitToken(token: string) {
        const regex = /([A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+)/g;
        return token.match(regex) || [];
    }

    let temp = str.replace(/[_-]/g, ' ');
    let tokens = temp.split(' ');
    let parts = tokens.flatMap(splitToken);
    let result = parts
        .map(word => {
            if (/^\d+$/.test(word)) return word;
            if (word.toUpperCase() === word) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

    return result.trimStart().trimEnd();
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class TaskTestcaseInfo {
    public readonly time_limit_s: number;
    public readonly memory_limit_mb: number;
    public readonly zip_path: string;
    public readonly tests_count: number;

    constructor(zip_path: string, tests_count: number) {
        this.time_limit_s = 5;
        this.memory_limit_mb = 128;
        this.zip_path = zip_path;
        this.tests_count = tests_count;
    }
}

class Task {
    public readonly name: string;
    public readonly displayName: string;
    private readonly cph_data: any;
    private readonly cph_path: string;
    private readonly code_path: string;
    private readonly folder_path: string;

    private constructor(name: string, cph_data: any, cph_path: string, code_path: string, folder_path: string) {
        console.log("[+] new task " + name);

        this.name = name;
        this.displayName = covertToDisplayName(name);
        this.cph_data = cph_data;
        this.cph_path = cph_path;
        this.code_path = code_path;
        this.folder_path = folder_path;
    }

    public static async create(cph_path: string): Promise<Task> {
        console.log("[+] create task at " + cph_path);

        const cph_data = await fs.readJSON(cph_path);
        const name = path.parse(cph_data.srcPath).name;
        const folder_path = path.dirname(cph_data.srcPath);

        await fs.ensureDir(folder_path);

        return new Task(name, cph_data, cph_path, cph_data.srcPath, folder_path);
    }

    public async buildTestcase(): Promise<TaskTestcaseInfo> {
        console.log("[+] build testcase for " + this.name);

        const temp_dir = path.join(this.folder_path, "cms_" + this.name);
        await fs.emptyDir(temp_dir);

        const zip = new AdmZip();

        for (let i = 0; i < this.cph_data.tests.length; i++) {
            const task = this.cph_data.tests[i];
            const i_name: string = (String)(i + 1);

            const in_file_path = path.join(temp_dir, "input." + i_name);
            const out_file_path = path.join(temp_dir, "output." + i_name);

            await fs.writeFile(in_file_path, task.input);
            await fs.writeFile(out_file_path, task.output);

            zip.addLocalFile(in_file_path);
            zip.addLocalFile(out_file_path);
        }

        const zip_path = path.join(this.folder_path, this.name + ".zip");
        await fs.remove(zip_path);

        await zip.writeZipPromise(zip_path);

        await fs.remove(temp_dir);

        return new TaskTestcaseInfo(zip_path, this.cph_data.tests.length);
    }
}

class WebHelper {
    private readonly browser: Browser;
    private readonly page: Page;
    private readonly baseUrl: string;

    private constructor(browser: Browser, mainPage: Page, baseUrl: string) {
        this.browser = browser;
        this.page = mainPage;
        this.baseUrl = baseUrl;
    }

    public static async launch(baseUrl: string): Promise<WebHelper> {
        console.log("[+] launch browser");

        const browser = await puppeteer.launch({
            headless: true
        });

        const page = (await browser.pages())[0];

        return new WebHelper(browser, page, baseUrl);
    }

    public async close() {
        console.log("[+] close browser");

        await this.browser.close();
    }

    public async goto(url: string) {
        console.log("[+] goto " + url);

        if (url.includes(this.baseUrl)) {
            await this.page.goto(url);
        }
        else {
            await this.page.goto(this.baseUrl + url);
        }

        await this.page.waitForNetworkIdle();
    }

    public async select<Selector extends string, Args extends unknown[], T>(query: Selector, finder: (e: NodeFor<Selector>, ...args: [...InnerParams<Args>]) => Promise<T | undefined> | T | undefined, ...args: Args): Promise<ElementHandle<NodeFor<Selector>>[]> {
        const selection = [];
        const elements: Array<ElementHandle<NodeFor<Selector>>> = await this.page.$$<Selector>(query);

        for (let item of elements) {
            if (await item.evaluate(finder, ...args)) {
                selection.push(item);
            }
        }

        return selection;
    }

    public async find<Selector extends string, Args extends unknown[]>(query: Selector, finder: (e: NodeFor<Selector>, ...args: [...InnerParams<Args>]) => Promise<boolean | undefined> | boolean | undefined = () => true, ...args: Args): Promise<ElementHandle<NodeFor<Selector>>> {
        const selection = await this.select(query, finder, ...args);

        if (selection.length == 0) {
            throw new Error("query \"" + query + "\" not found");
        }

        if (selection.length > 1) {
            throw new Error("find query \"" + query + "\" more than one");
        }

        return selection[0];
    }

    public async get<Selector extends string, Args extends unknown[], T>(query: Selector, finder: (e: NodeFor<Selector>, ...args: [...InnerParams<Args>]) => Promise<T | undefined> | T | undefined, ...args: Args): Promise<T> {
        const elements: Array<ElementHandle<NodeFor<Selector>>> = await this.page.$$<Selector>(query);

        for (let item of elements) {
            const value = await item.evaluate(finder, ...args);
            if (value) {
                return value;
            }
        }

        throw new Error("query \"" + query + "\" not found");
    }

    async download(webUrl: string, local_path: string, clickHanlder: (p: Page) => Promise<void>) {
        const local_dir = path.dirname(local_path);
        const temp_dir = path.join(local_dir, "cmd_download_cache");
        await fs.emptyDir(temp_dir);

        const downloadPage = await this.browser.newPage();

        const client = await downloadPage.createCDPSession();

        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: temp_dir
        });

        await downloadPage.goto(webUrl);
        await downloadPage.waitForNetworkIdle();

        await clickHanlder(downloadPage);
        await downloadPage.waitForNetworkIdle();

        await downloadPage.close();

        for (const item of (await fs.readdir(temp_dir))) {
            await fs.remove(local_path);
            await fs.move(path.join(temp_dir, item), local_path);
        }

        await fs.remove(temp_dir);
    }

    public async login(user: string, password: string) {
        console.log("[+] login");

        await this.goto("/login");

        await this.page.type('input[name="username"]', user);
        await this.page.type('input[name="password"]', password);
        await this.page.click('button[type="submit"]');
        await this.page.waitForNetworkIdle();

        if (this.page.url().includes("login")) {
            throw new Error("login failed");
        }
    }

    public async findWebContest(name: string): Promise<string> {
        await this.goto("/contests");

        const contestElement = await this.select("a", (e, str) => e.innerText.includes(str), name);
        return contestElement[0].evaluate(e => e.href);
    }

    public async findWebTask(task: Task): Promise<string> {
        await this.goto("/tasks");

        const taskElement = await this.find("a", (e, str) => e.innerText.includes(str), task.displayName);
        return taskElement.evaluate(e => e.href);
    }

    public async createWebTask(task: Task): Promise<string> {
        console.log("[+] create web task for " + task.displayName);

        await this.goto("/tasks/add");

        const taskSubmitButton = await this.find('input[type="submit"]', e => e.getAttribute("value") != "Logout");
        await this.page.type('input[name="name"]', task.displayName);
        await taskSubmitButton.click();
        await this.page.waitForNetworkIdle();

        let taskUrl = this.page.url();
        if (taskUrl.includes("/tasks/add")) {
            console.log("[?] web task already exists, try get web task for " + task.displayName);

            taskUrl = await this.findWebTask(task);
        }

        await this.updateWebTask(task, taskUrl);

        return taskUrl;
    }

    public async updateWebTask(task: Task, taskUrl: string) {
        console.log("[+] update web task for " + task.displayName);

        await this.goto(taskUrl);

        console.log("[+] collecting task info for " + task.displayName);

        const taskTastcaseRedirect: string = await this.get("a", e => { const x = e.getAttribute("href"); if (x?.includes("add_multiple")) return x; });
        //const taskStatementRedirect: string = await this.get("a", e => { const x = e.getAttribute("href"); if (x?.includes("statements/add")) return x; });

        const taskTastcaseURL = this.baseUrl + "/" + taskTastcaseRedirect.substring(taskTastcaseRedirect.indexOf('d'));
        //const taskStatementURL = this.baseUrl + "/" + taskStatementRedirect.substring(taskStatementRedirect.indexOf('t'));

        await this.updateWebTaskTestcase(task, taskUrl, taskTastcaseURL);

        console.log("[+] complete update web task for " + task.displayName);
    }

    public async updateWebTaskTestcase(task: Task, taskUrl: string, taskTestcaseURL: string) {
        console.log("[+] update web testcase for " + task.displayName);

        const testcaseInfo: TaskTestcaseInfo = await task.buildTestcase();

        console.log("[+] change web testcase settings for " + task.displayName);
        await this.goto(taskUrl);

        console.log("[+] -> time limit");
        const timeLimitInput = await this.find("input[type=text]", e => e.getAttribute("name")?.includes("time_limit"));
        await timeLimitInput.evaluate((e, str) => e.value = str, testcaseInfo.time_limit_s.toString());

        console.log("[+] -> memory limit");
        const memoryLimitInput = await this.find("input[type=text]", e => e.getAttribute("name")?.includes("memory_limit"));
        await memoryLimitInput.evaluate((e, str) => e.value = str, testcaseInfo.memory_limit_mb.toString());

        console.log("[+] -> score calculation");
        const scoreTextArea = await this.find("textarea", e => e.getAttribute("name")?.includes("score_type_parameters"));
        await scoreTextArea.evaluate((e, str) => e.value = str, (100 / testcaseInfo.tests_count).toFixed(5));

        console.log("[+] -> score mode");
        await this.page.select('select[name=score_mode]', 'max');

        const submitUpdateButton = await this.find('input[type="submit"]', e => e.getAttribute("value") == "Update");
        await submitUpdateButton.click();
        await this.page.waitForNetworkIdle();

        console.log("[+] change web task testcase for " + task.displayName);
        await this.goto(taskTestcaseURL);

        const fileElement = await this.find('input[type=file]');
        await fileElement.uploadFile(testcaseInfo.zip_path);

        const publicBox = await this.find('input[type=checkbox]', e => e.getAttribute("name") == "public");
        await publicBox.click();

        const submitTestButtons = await this.find('input[type="submit"]', e => e.getAttribute("value") != "Logout");
        await submitTestButtons.click();
        await this.page.waitForNetworkIdle();
    }

    public async downloadWebTask(taskUrl: string, folder_path: string) {
        console.log("[+] download web task at " + taskUrl);
        await this.goto(taskUrl);

        console.log("[+] collecting web testcase settings for " + taskUrl);

        const name = await this.get("input[type=text]", e => { if (e.getAttribute("name")?.includes("name")) return e.value; });
        const timeLimit = await this.get("input[type=text]", e => { if (e.getAttribute("name")?.includes("time_limit")) return e.value; });
        const memoryLimit = await this.get("input[type=text]", e => { if (e.getAttribute("name")?.includes("memory_limit")) return e.value; });

        const task_folder = path.join(folder_path, name);
        await fs.ensureDir(task_folder);

        console.log("[+] start download statement for " + name);

        const statement_web_url_collection = await this.select("a", e => e.getAttribute("href")?.includes("statement.pdf"));
        for (const statement_web of statement_web_url_collection) {
            const name = await statement_web.evaluate(e => e.innerText);
            const href = await statement_web.evaluate(e => e.getAttribute("href")) || "";
            const statement_local_file = path.join(task_folder, name.replaceAll(/[^a-zA-Z0-9\s]/g, "") + ".pdf");
            await this.download(taskUrl, statement_local_file, async (p) => {
                const element = await p.$("a[href=\"" + href + "\"");
                await element?.click();
            });
        }

        console.log("[+] start download testcase for " + name);

        const testcase_web = await this.find("a", e => e.getAttribute("href")?.includes("testcases/download"));
        await testcase_web.click();
        await this.page.waitForNetworkIdle();
        const testcase_local_file = path.join(task_folder, "testcase.zip");
        await this.download(this.page.url(), testcase_local_file, async (p) => {
            const elements = await p.$$("input[type='submit']");

            for (const item of elements) {
                if (await item.evaluate(e => e.getAttribute("value")) == "Download") {
                    await item.click();
                }
            }

        });
    }

    public async downloadWebContest(contestUrl: string, folder_path: string) {
        console.log("[+] start download web contest at " + contestUrl);

        const usedHref: string[] = []

        let max_loop = 1000;

        while (max_loop--) {
            await this.goto(contestUrl);

            const taskCollection = await this.select("a", e => e.getAttribute("href")?.includes("/task/"));

            let findOnce = false;

            for (const task of taskCollection) {
                if (findOnce) {
                    break;
                }

                const href = await task.evaluate(e => e.href);

                if (usedHref.includes(href)) {
                    continue;
                }

                usedHref.push(href);

                await this.downloadWebTask(href, folder_path);
                await sleep(100);

                await this.goto(contestUrl);

                findOnce = true;
            }

            if (!findOnce)
            {
                break;
            }
        }
    }
}

async function main() {
    const self_path = process.argv[1];
    const self_folder = path.dirname(self_path);
    await fs.ensureDir(self_folder);
    const self_env = path.join(self_folder, "testhelper.z.env");
    if (!await fs.exists(self_env)) {
        await fs.writeFile(self_env, "CMS_USERNAME = \nCMS_PASSWORD = \nCMS_BASE_URL = \n");
        console.log("[-] please add a settings at " + self_env);
        return;
    }

    dotenv.config({
        path: self_env
    });

    if (!process.env.CMS_USERNAME || !process.env.CMS_PASSWORD || !process.env.CMS_BASE_URL) {
        console.log("[-] load settings fail");
        return;
    }

    const web: WebHelper = await WebHelper.launch(process.env.CMS_BASE_URL);

    try {
        await web.login(process.env.CMS_USERNAME, process.env.CMS_PASSWORD);

        const arg_raw = process.argv[2];
        if (!arg_raw || arg_raw.trim() == "") {
            console.log("[?] nothing to do");
            return;
        }

        // task upload
        if (await fs.exists(arg_raw) && (await fs.lstat(arg_raw)).isFile()) {
            const cph_path = path.join(__dirname, arg_raw);

            if (!arg_raw.endsWith(".prob")) {
                console.log("[-] unknown file at " + cph_path);
                return;
            }

            const task: Task = await Task.create(cph_path);

            await web.createWebTask(task);
            return;
        }

        // contest download
        const contestURL = await web.findWebContest(arg_raw);
        await web.goto(contestURL);

        const contestFolder = path.join(self_folder, arg_raw);
        await fs.emptyDir(contestFolder);

        const contestTaskURL = await web.find("a[class='menu_link']", e => e.getAttribute("href")?.includes("/tasks"));
        await web.downloadWebContest(await contestTaskURL.evaluate(e => e.href), contestFolder);
    }
    catch (e) {
        console.log("[-] web error");
        console.error(e);
    }
    finally {
        await web.close();
    }
};

main();