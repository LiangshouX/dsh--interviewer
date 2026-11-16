/*!
 * dsh-realtime-interview — client half (browser bundle).
 *
 * 模拟面试间 —— 把「简历 + 目标岗位 JD」变成**一场有准备的面试**。
 *
 * 设计语言：**面试卷宗**。
 *
 * 一场面试就是一份案卷：简历与 JD 是卷内材料，考点清单是**面试官的底稿**
 * （真实面试里你看不到它），转录是速记，面试后的报告是评估表。
 * 这个隐喻不是装饰——它直接对应产品纪律：
 *
 *   ① **底稿默认收起。** 考点清单在准备阶段可查可改，但进了面试就不是
 *      「你将���被问到的问题」——那会把一场面试变成答题游戏。
 *   ② **舞台永远是主位。** 面试中，视频区占满左半屏；没有摄像头时也
 *      不塌成一行提示——那是一个**设计过的「未接通」状态**，因为画面
 *      本身就是面试室的一部分。
 *   ③ **权限被拒不是死路。** 拿不到摄像头是常事，所以插件会**主动发起
 *      授权申请**，并盯着系统设置里的变化自动接上，而不是甩一句错误。
 *   ④ **输入永远有两条路。** 语音识别是效率，键盘输入是保底。
 *
 * 配色：**深墨底 + 骨白纸感 + 单一氧化朱红（REC）+ 琥珀（提问）+ 青玉（就绪）**。
 * 主按钮用骨白反色而不是蓝——蓝按钮会让它退回通用后台的样子。
 *
 * Bundle format: the official DSH client-bundle shape — a lazy-CJS closure
 * registered with window.__ModuleLoader__.load({ id, factory }). `react` comes
 * from the browser module table at runtime; everything else is inlined, so the
 * plugin carries no build step and no runtime dependency.
 */
