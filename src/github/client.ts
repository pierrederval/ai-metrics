import { githubApp } from './app';
export const installationClient=(installationId:string)=>githubApp().getInstallationOctokit(Number(installationId));
