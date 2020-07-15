const _ = require('lodash');
const Boom = require('boom');
const Joi = require('joi');

const InstallmentHelper = require('../helper/installmentHelper');
const FundingData = require('../model/fundingData');
const ConstantHelper = require('../helper/constantHelper');
const AssetHelper = require('../helper/assetHelper');
const LoanData = require('../model/loanData');

const JurnalHelper = require('../helper/jurnalHelper');

const getListInstallment = async (request, h) => {
    const req = request.payload;
    try {
        const listInstallment = await InstallmentHelper.getListInstallment(req.loanCode);
        return h.response({ listInstallment });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const getAllInstallmentByLoanCode = async (request, h) => {
    const req = request.payload;
    try {
        const listInstallment = await InstallmentHelper.getListInstallmentByUser(req.userCode);
        return h.response({ listInstallment });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const getDetailInstallmentWithId = async (request, h) => {
    const req = request.payload;
    try {
        const detailInstallment = await InstallmentHelper.getDetailInstallmentById(req.installmentId);
        return h.response({detailInstallment});
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const getAllInstallment = async (request, h) => {
    const req = request.payload;
    try {
        const listInstallment = await InstallmentHelper.getAllInstallmentHelper();
        return h.response({ listInstallment });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const disbursementInstallmentstatus = async (request, h) => {
    const req = request.payload;
    try {
        const disburse = await InstallmentHelper.disbursementInstallmentstatusHelper(req.disbursementStatus);
        return h.response({ disburse });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const disburseInstallment = async (request, h) => {
    const req = request.payload;
    try {
        // get total penalti keterlambatan pada cicilan pinjaman saat ini
        const currentInstallment = await InstallmentHelper.getAmountLateInterest(req.loanCode);
        console.log('bunga keterlambatan: ' + currentInstallment[0].amount_late_interest);

        // get jumlah amount cicilan per bulannya
        // const amountInstallment = await InstallmentHelper.getAmountInstallment(req.loanCode);

        // get rdl investor, select investor from tbl_funding_detail
        const getRdlInvestor = await FundingData.getListFunding(req.loanCode);

        const serviceFeeAllInvestor = [];
        const descriptions = 'Transfer Installment to RDL for loan ' + req.loanCode;
        for (const rdl of getRdlInvestor) {
            console.log('User Code Investor (Loop) :' + rdl.user_code);
            console.log('RDL Investor (Loop) :' + rdl.virtual_acc);
            console.log('install (Loop) :' + currentInstallment[0].plan);
            console.log('loancode (Loop) :' +  req.loanCode);
           
            const investorIncome = await InstallmentHelper.getInvestorIncome(req.loanCode, rdl.user_code, currentInstallment[0].plan);
            console.log('amount investor : ' + investorIncome[0].amount);
            console.log('service fee investor : ' + investorIncome[0].service_fee);
            console.log('payment amount : ' + investorIncome[0].payment_amount);
            // perbaikan service fee jika ada denda 
            //const servicefeedenda = (investorIncome[0].service_fee * investorIncome[0].amount / investorIncome[0].amount);
            //console.log('payment amount : ' + investorIncome[0].payment_amount);
            
            //const finalAmountDenda = await investorIncome[0].payment_amount - servicefeedenda;
            const finalAmount = await investorIncome[0].amount - investorIncome[0].service_fee; // total yang didapat investor dari cicilan borrower
            //console.log('Total keseluruhan yang di dapat Investor: ' + finalAmount);
            //  Transfer to Rdl Investor

            //if (rdl.virtual_acc === '0910362671') {
            const investorDisbursmentApi = await AssetHelper.paymentIdrProcess('009', null, null, finalAmount, rdl.virtual_acc, descriptions, null, null, null, null);
            console.log('investorDisbursmentApi', investorDisbursmentApi.response.responseUuid);
            
            //console.log('danonDisbursementApixxxx2', investorDisbursmentApi.response.responseCode);
            // (investorDisbursmentApi.response)

            

            //INSERT INTO tbl_withdraw_txn
            await AssetHelper.insertDisbursement(rdl.user_code, finalAmount, await ConstantHelper.getValue('danonBankName'), 3,
                investorDisbursmentApi.response.journalNum, rdl.virtual_acc, rdl.user_code, descriptions, investorDisbursmentApi.response.responseUuid);
            //}
            // insert ke asset_txn, adjust database add by tigor 
            // mmasukan  transaksi kembali dana dari pembayaran installment ( nilai nya positif)
            //=======================di remark  karena dobel dengan balikan dari RDL Call back
            //await AssetHelper.insertAssetTxn(rdl.user_code, rdl.virtual_acc, finalAmount, await ConstantHelper.getValue('danonBankName'),
            //'C', investorDisbursmentApi.response.journalNum, new Date().toISOString());

            // for account no
             const assetInfo = await AssetHelper.getAssetInfo(rdl.virtual_acc);

            const accounting_flag = 'C';
             
            //await AssetHelper.updateAsset(rdl.virtual_acc, assetInfo[0].balance, finalAmount, (accounting_flag === 'C') ? 0 : 1);
            // ============================sampai sini
            // disini di letakkan journal otomatis ke investor by tigor
            console.log('=== Hutang Investor');
            await JurnalHelper.insertJurnalOtomatis('HUTANG_INVESTOR','DR',finalAmount,'Pengeluaran dana dari Bank Escrow ke RDL Pemodal',req.loanCode);
           
            // disini di letakkan journal otomatis ke investor by tigor
            console.log('=== Hutang Investor');
            await JurnalHelper.insertJurnalOtomatis('BANK_ESCROW','CR',finalAmount,'Pengeluaran dana dari Bank Escrow ke RDL Pemodal',req.loanCode);
           
            // disini di letakkan journal otomatis ke investor by tigor
            console.log('=== BANK_GIRO_BNI');
            await JurnalHelper.insertJurnalOtomatis('BANK_GIRO_BNI','DR',investorIncome[0].service_fee,'Pengeluaran dana dari Bank Escrow ke BANK_GIRO_BNI',req.loanCode);
           
            console.log('=== BANK_GIRO_BNI');
            await JurnalHelper.insertJurnalOtomatis('BANK_ESCROW','CR',investorIncome[0].service_fee,'Pengeluaran dana dari Bank Escrow ke BANK_GIRO_BNI',req.loanCode);

            // Save all Service fee from all investor in Array
            //serviceFeeAllInvestor.push(investorIncome[0].service_fee);
            serviceFeeAllInvestor.push(investorIncome[0].service_fee);
        }

        let totalServiceFee = 0;
        // Sum Total Service Fee from array serviceFeeAllInvestor to get Total Service fee
        // untuk method_bayar = 1
        const method_bayar = await LoanData.getLoanDetail(req.loanCode);


        if (method_bayar[0].method_bayar === 1) {
        if (currentInstallment[0].plan > 1) {
            //totalServiceFee = serviceFeeAllInvestor.reduce((partialSum, a) => partialSum + a) + currentInstallment[ 0 + 1 ].amount_late_interest;
            totalServiceFee = serviceFeeAllInvestor.reduce((partialSum, a) => partialSum + a); //+ currentInstallment[ 0 + 1 ].amount_late_interest;
           
            console.log('yang di transfer ke rekening giro: ' + totalServiceFee);
        } else {
            totalServiceFee = serviceFeeAllInvestor.reduce((partialSum, a) => partialSum + a);
            console.log('yang di transfer ke rekening giro: ' + totalServiceFee);
        }
    }else //if (method_bayar[0].method_bayar === 2)
    {
        totalServiceFee = serviceFeeAllInvestor.reduce((partialSum, a) => partialSum + a); //+ currentInstallment[0].amount_late_interest;
            console.log('yang di transfer ke rekening giro metode 3: ' + totalServiceFee);
       }

        // Transfer to danon giro
        const danonDescription = 'Disburse Installment for loan ' + req.loanCode;

        if (totalServiceFee > 0 ){

            const danonDisbursementApi = await AssetHelper.paymentIdrProcess(await ConstantHelper.getValue('danonBankCode'), await ConstantHelper.getValue('danonClearingCode'), await ConstantHelper.getValue('danonRtgsCode'),
                totalServiceFee, await ConstantHelper.getValue('danonGiroNo'), danonDescription, await ConstantHelper.getValue('danonAddress1'), await ConstantHelper.getValue('danonAddress2'), await ConstantHelper.getValue('danonFullName'), 'BEN');
            console.log('danonDisbursementApi', danonDisbursementApi);

            await AssetHelper.insertDisbursement(await ConstantHelper.getValue('danonUserCode'), totalServiceFee, await ConstantHelper.getValue('danonBankName'), 3,
                danonDisbursementApi.response.journal_number, await ConstantHelper.getValue('danonGiroNo'), await ConstantHelper.getValue('danonFullName'), danonDescription, 
                danonDisbursementApi.response.responseUuid);
        }
        else {
            await AssetHelper.insertDisbursement(await ConstantHelper.getValue('danonUserCode'), totalServiceFee, await ConstantHelper.getValue('danonBankName'), 3,
                null, await ConstantHelper.getValue('danonGiroNo'), await ConstantHelper.getValue('danonFullName'), danonDescription, 
                null);
            
        }

        // const danonDisbursementApi = await AssetHelper.paymentIdrProcess(await ConstantHelper.getValue('danonBankCode'), await ConstantHelper.getValue('danonClearingCode'), await ConstantHelper.getValue('danonRtgsCode'),
        //     totalServiceFee, await ConstantHelper.getValue('danonGiroNo'), danonDescription, await ConstantHelper.getValue('danonAddress1'), await ConstantHelper.getValue('danonAddress2'), await ConstantHelper.getValue('danonFullName'), 'BEN');
        // console.log('danonDisbursementApi', danonDisbursementApi);


        // await AssetHelper.insertDisbursement(await ConstantHelper.getValue('danonUserCode'), totalServiceFee, await ConstantHelper.getValue('danonBankName'), 3,
        //     danonDisbursementApi.response.journal_number, await ConstantHelper.getValue('danonGiroNo'), await ConstantHelper.getValue('danonFullName'), danonDescription, 
        //     danonDisbursementApi.response.responseUuid);

        const updateDisburseInstallmentStatus = await InstallmentHelper.updateDisburseInstallmentStatus(currentInstallment[0].plan, req.loanCode);

        // disini di letakkan journal otomatis service fee by tigor
        console.log('=== Pendapatan Penagihan');
        await JurnalHelper.insertJurnalOtomatis('HUTANG_INVESTOR','CR',totalServiceFee,'Pendapatan Penagihan',req.loanCode);
       
        await JurnalHelper.insertJurnalOtomatis('PENDAPATAN_PENAGIHAN','DR',totalServiceFee,'Pendapatan Penagihan',req.loanCode);
               


        return h.response({ updateDisburseInstallmentStatus });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

const updateInstallmentRemainder = async (request, h) => {
    const req = request.payload;
    try {
        const updateRemainder = await InstallmentHelper.updateInstallmentRemainder(req.id, req.noted, req.remainder, req.nextAction, req.borReason);
        return h.response({ updateRemainder });
    } catch (err) {
        return Boom.badRequest(err.message);
    }
};

exports.plugin = {
    register: (server, options) => {
        options = _.extend({ basePath: '' }, options);

        server.route([{
            method: 'POST',
            path: options.basePath + '/get-installment',
            handler: getListInstallment,
            options: {
                description: 'Get installment data',
                tags: ['api', 'installment'],
                auth: false,
                validate: {
                    payload: {
                        loanCode: Joi.string().required()
                    }
                }
            }
        }, {
            method: 'POST',
            path: options.basePath + '/get-disburse-installments-status',
            handler: disbursementInstallmentstatus,
            options: {
                description: 'Get all installment data',
                tags: ['api', 'installment'],
                validate: {
                    payload: {
                        disbursementStatus: Joi.number().required()
                    }
                }
            }
        }, {
            method: 'POST',
            path: options.basePath + '/disburse-installment',
            handler: disburseInstallment,
            options: {
                description: 'Get all installment data',
                tags: ['api', 'installment'],
                auth: false,
                validate: {
                    payload: {
                        loanCode: Joi.string().required()
                    }
                }
            }
        }, {
            method: 'GET',
            path: options.basePath + '/get-allinstallment',
            handler: getAllInstallment,
            options: {
                description: 'Get all installment data',
                tags: ['api', 'installment'],
                auth:false
            }
        }, {
            method: 'POST',
            path: options.basePath + '/get-detail-installment-id',
            handler: getDetailInstallmentWithId,
            options: {
                description: 'Get all installment data',
                tags: ['api', 'installment'],
                auth:false,
                validate : {
                    payload: {
                        installmentId: Joi.string().required()
                    }
                }
            }
        }, {
            method: 'POST',
            path: options.basePath + '/update-remainder-installment',
            handler: updateInstallmentRemainder,
            options: {
                description: 'Update remainder installment data',
                tags: ['api', 'installment'],
                auth:false,
                validate : {
                    payload: {
                        id: Joi.string().required(),
                        noted: Joi.string().required(),
                        remainder: Joi.string().required(),
                        nextAction: Joi.string().required(),
                        borReason: Joi.string().required()
                    }
                }
            }
        }, {
            method: 'POST',
            path: options.basePath + '/getall-installment',
            handler: getAllInstallmentByLoanCode,
            options: {
                description: 'Get all installment data',
                tags: ['api', 'installment'],
                auth: false,
                validate: {
                    payload: {
                        userCode: Joi.string().required()
                    }
                }
            }
        }]);
    },

    'name': 'api-installment'
};
